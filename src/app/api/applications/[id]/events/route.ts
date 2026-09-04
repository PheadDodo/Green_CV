import { NextResponse } from "next/server";
import { z } from "zod";

import { AuthRequiredError, requireUser } from "@/lib/auth";
import { DataNotFoundError, getDataRepository } from "@/lib/data";
import { runAutomations } from "@/lib/services/run-automations";

const absoluteInstant = z.string().refine((value) => {
  const hasOffset = /(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value);
  return hasOffset && Number.isFinite(Date.parse(value));
});

const schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("note"), notes: z.string().max(4_000).optional() }).strict(),
  z.object({ kind: z.literal("response"), notes: z.string().max(4_000).optional() }).strict(),
  z.object({ kind: z.literal("follow_up"), notes: z.string().max(4_000).optional() }).strict(),
  z.object({
    kind: z.literal("interview"),
    notes: z.string().max(4_000).optional(),
    interviewAt: absoluteInstant,
  }).strict(),
]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const [{ id }, user] = await Promise.all([params, requireUser()]);
    const parsed = schema.safeParse(await request.json().catch(() => undefined));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid activity details." }, { status: 400 });
    }

    const input = parsed.data;
    const repository = await getDataRepository({ userId: user.id });
    const application = await repository.getApplication(id);
    if (!application) {
      return NextResponse.json({ error: "Application not found." }, { status: 404 });
    }

    if (input.kind === "response") {
      const applicationStatus = application.status === "applied"
        ? "screening"
        : application.status;
      const updated = await repository.updateApplicationStatus(
        id,
        applicationStatus,
        input.notes || "Recruiter response received",
      );
      return NextResponse.json({ application: updated });
    }

    if (input.kind === "interview") {
      const date = new Date(input.interviewAt);
      if (date.getTime() <= Date.now()) {
        return NextResponse.json({ error: "Choose a future interview time." }, { status: 400 });
      }
      if (application.status !== "interview") {
        await repository.updateApplicationStatus(id, "interview", input.notes);
      }
      const event = await repository.createApplicationEvent({
        applicationId: id,
        type: "interview_scheduled",
        title: "Interview scheduled",
        details: input.notes || null,
        metadata: { interviewAt: date.toISOString() },
      });
      await runAutomations(repository, user.id);
      return NextResponse.json({ event }, { status: 201 });
    }

    const event = await repository.createApplicationEvent({
      applicationId: id,
      type: input.kind,
      title: input.kind === "follow_up" ? "Follow-up sent" : "Note added",
      details: input.notes || null,
    });
    return NextResponse.json({ event }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    if (error instanceof DataNotFoundError) {
      return NextResponse.json({ error: "Application not found." }, { status: 404 });
    }
    return NextResponse.json({ error: "Could not record activity." }, { status: 500 });
  }
}
