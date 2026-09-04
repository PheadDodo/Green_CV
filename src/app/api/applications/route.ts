import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthRequiredError, requireUser } from "@/lib/auth";
import { DataConflictError, DataNotFoundError, getDataRepository } from "@/lib/data";
import { APPLICATION_STATUSES, EMPLOYMENT_TYPES, WORKPLACE_TYPES } from "@/lib/data/types";
import { runAutomations } from "@/lib/services/run-automations";

const createSchema = z.object({
  title: z.string().trim().min(2).max(180),
  company: z.string().trim().min(2).max(180),
  description: z.string().trim().min(20).max(100_000),
  location: z.string().trim().max(200).optional(),
  sourceUrl: z.union([z.literal(""), z.url({ protocol: /^https?$/ })]).optional(),
  workplaceType: z.enum(WORKPLACE_TYPES).default("unspecified"),
  employmentType: z.enum(EMPLOYMENT_TYPES).default("full_time"),
  status: z.enum(APPLICATION_STATUSES).default("saved"),
  cvVersionId: z.string().uuid().or(z.literal("")).optional()
}).strict();

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = createSchema.parse(await request.json());
    const repository = await getDataRepository({ userId: user.id });
    const application = await repository.createApplication({
      job: {
        title: input.title,
        company: input.company,
        description: input.description,
        location: input.location || null,
        sourceUrl: input.sourceUrl || null,
        source: input.sourceUrl ? "url" : "manual",
        workplaceType: input.workplaceType,
        employmentType: input.employmentType
      },
      application: {
        status: input.status,
        cvVersionId: input.cvVersionId || null,
        appliedAt: input.status === "applied" ? new Date().toISOString() : null
      }
    });
    if (application.cvVersionId) await runAutomations(repository, user.id);
    return NextResponse.json({ application }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid application details." }, { status: 400 });
    }
    if (error instanceof DataNotFoundError) {
      return NextResponse.json({ error: "CV version not found." }, { status: 404 });
    }
    if (error instanceof DataConflictError) {
      return NextResponse.json({ error: "Application conflicts with existing data." }, { status: 409 });
    }
    return NextResponse.json({ error: "Could not create application." }, { status: 500 });
  }
}
