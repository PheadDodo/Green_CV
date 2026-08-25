import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getDataRepository } from "@/lib/data";
import { runAutomations } from "@/lib/services/run-automations";

const schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("note"), notes: z.string().max(4000).optional() }),
  z.object({ kind: z.literal("response"), notes: z.string().max(4000).optional() }),
  z.object({ kind: z.literal("follow_up"), notes: z.string().max(4000).optional() }),
  z.object({ kind: z.literal("interview"), notes: z.string().max(4000).optional(), interviewAt: z.string().min(1) })
]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [{ id }, user, input] = await Promise.all([params, requireUser(), request.json().then(value => schema.parse(value))]);
    const repository = await getDataRepository({ userId: user.id });
    const application = await repository.getApplication(id);
    if (!application) return NextResponse.json({ error: "Application not found." }, { status: 404 });
    if (input.kind === "response") {
      const updated = await repository.updateApplicationStatus(id, application.status === "applied" ? "screening" : application.status, input.notes || "Recruiter response received");
      return NextResponse.json({ application: updated });
    }
    if (input.kind === "interview") {
      const date = new Date(input.interviewAt);
      if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) return NextResponse.json({ error: "Choose a future interview time." }, { status: 400 });
      if (application.status !== "interview") await repository.updateApplicationStatus(id, "interview", input.notes);
      const event = await repository.createApplicationEvent({ applicationId: id, type: "interview_scheduled", title: "Interview scheduled", details: input.notes || null, metadata: { interviewAt: date.toISOString() } });
      await runAutomations(repository, user.id);
      return NextResponse.json({ event }, { status: 201 });
    }
    const event = await repository.createApplicationEvent({ applicationId: id, type: input.kind, title: input.kind === "follow_up" ? "Follow-up sent" : "Note added", details: input.notes || null });
    return NextResponse.json({ event }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not record activity." }, { status: 400 });
  }
}
