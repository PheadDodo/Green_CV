import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getDataRepository } from "@/lib/data";
import { type JobCreateInput } from "@/lib/data/types";
import { parseJobsCsv } from "@/lib/import/csv";

// JSON escaping adds overhead, so keep previews below the platform request cap.
const previewSchema = z.object({ csv: z.string().min(1).max(3 * 1024 * 1024), fileName: z.string().max(255).optional(), commit: z.literal(false) });
const commitSchema = z.object({ jobs: z.array(z.object({ title: z.string().min(1), company: z.string().min(1), description: z.string().min(1), location: z.string().nullable().optional(), workplaceType: z.enum(["remote","hybrid","onsite","unspecified"]).optional(), employmentType: z.enum(["full_time","part_time","contract","internship","temporary","unspecified"]).optional(), sourceUrl: z.string().url().nullable().optional() }).passthrough()).max(5000), fileName: z.string().max(255).optional(), commit: z.literal(true) });

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const raw = await request.json();
    if (!raw.commit) {
      const input = previewSchema.parse(raw);
      const result = parseJobsCsv(input.csv);
      return NextResponse.json(result);
    }
    const input = commitSchema.parse(raw);
    const repository = await getDataRepository({ userId: user.id });
    const batch = await repository.createImportBatch({ source: "csv", fileName: input.fileName, totalRows: input.jobs.length, status: "processing" });
    const result = await repository.bulkCreateApplications(input.jobs.map(job => ({ job: { ...(job as JobCreateInput), source: "csv" }, application: { status: "saved" } })), batch.id);
    await repository.updateImportBatch(batch.id, { status: result.errors.length ? "partial" : "completed", processedRows: input.jobs.length, succeededRows: result.applications.length, failedRows: result.errors.length, errors: result.errors, completedAt: new Date().toISOString() });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "CSV import failed." }, { status: 400 });
  }
}
