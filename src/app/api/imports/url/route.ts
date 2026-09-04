import { NextResponse } from "next/server";
import { z } from "zod";

import { AuthRequiredError, requireUser } from "@/lib/auth";
import { getDataRepository } from "@/lib/data";
import { DataConflictError, DataNotFoundError } from "@/lib/data/repository";
import { EMPLOYMENT_TYPES, WORKPLACE_TYPES } from "@/lib/data/types";
import { fetchJobDescription, JobUrlImportError } from "@/lib/import/url";

const SAFE_ROW_IMPORT_ERROR = "This row could not be imported.";

const httpUrl = z.string().url().max(2048).refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "http:" || protocol === "https:";
}, "Only HTTP and HTTPS URLs are allowed.");

const previewSchema = z.object({
  url: httpUrl,
  commit: z.literal(false).optional(),
}).strict();

const commitSchema = z.object({
  title: z.string().trim().min(2).max(180),
  company: z.string().trim().min(2).max(180),
  description: z.string().trim().min(20).max(100_000),
  location: z.string().trim().max(200).optional(),
  sourceUrl: httpUrl,
  workplaceType: z.enum(WORKPLACE_TYPES).default("unspecified"),
  employmentType: z.enum(EMPLOYMENT_TYPES).default("unspecified"),
  commit: z.literal(true),
}).strict();

function errorResponse(error: unknown): NextResponse {
  if (error instanceof AuthRequiredError) {
    return NextResponse.json(
      { error: "You must sign in to continue." },
      { status: 401 },
    );
  }
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return NextResponse.json(
      { error: "Invalid URL import request." },
      { status: 400 },
    );
  }
  if (error instanceof JobUrlImportError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof DataConflictError || error instanceof DataNotFoundError) {
    return NextResponse.json(
      { error: "Could not save the imported job." },
      { status: 400 },
    );
  }
  return NextResponse.json(
    { error: "Could not import this URL." },
    { status: 500 },
  );
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const raw = await request.json();

    if (raw?.commit === true) {
      const input = commitSchema.parse(raw);
      const repository = await getDataRepository({ userId: user.id });
      const batch = await repository.createImportBatch({
        source: "url",
        fileName: "URL import",
        totalRows: 1,
        status: "processing",
      });
      const result = await repository.bulkCreateApplications([{
        job: {
          title: input.title,
          company: input.company,
          description: input.description,
          location: input.location || null,
          workplaceType: input.workplaceType,
          employmentType: input.employmentType,
          sourceUrl: input.sourceUrl,
          source: "url",
        },
        application: { status: "saved" },
      }], batch.id);
      const errors = result.errors.map((error) => ({
        row: error.row,
        message: SAFE_ROW_IMPORT_ERROR,
      }));
      const application = result.applications[0];
      if (!application) {
        await repository.updateImportBatch(batch.id, {
          status: "failed",
          totalRows: 1,
          processedRows: 1,
          succeededRows: 0,
          failedRows: 1,
          errors,
          completedAt: new Date().toISOString(),
        });
        return NextResponse.json({
          error: "Could not save the imported job.",
          errors,
        }, { status: 400 });
      }
      return NextResponse.json({ application, errors }, { status: 201 });
    }

    const { url } = previewSchema.parse(raw);
    const job = await fetchJobDescription(url, {
      timeoutMs: 10_000,
      maxBytes: 2 * 1024 * 1024,
      maxRedirects: 3,
    });
    return NextResponse.json({ job });
  } catch (error) {
    return errorResponse(error);
  }
}
