import { NextResponse } from "next/server";
import { z } from "zod";

import { AuthRequiredError, requireUser } from "@/lib/auth";
import {
  DataConflictError,
  DataNotFoundError,
  getDataRepository,
} from "@/lib/data";
import { runAutomations } from "@/lib/services/run-automations";

const identifier = z.string().uuid();
const schema = z.object({ cvVersionId: z.string().uuid().nullable() }).strict();

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!identifier.safeParse(id).success) {
      return NextResponse.json({ error: "Application not found." }, { status: 404 });
    }
    const user = await requireUser();
    const parsed = schema.safeParse(await request.json().catch(() => undefined));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid CV attachment." }, { status: 400 });
    }

    const repository = await getDataRepository({ userId: user.id });
    if (parsed.data.cvVersionId && !(await repository.getCvVersion(parsed.data.cvVersionId))) {
      return NextResponse.json({ error: "CV version not found." }, { status: 404 });
    }
    const application = await repository.updateApplicationCv(id, parsed.data.cvVersionId);
    if (parsed.data.cvVersionId) await runAutomations(repository, user.id);
    return NextResponse.json({ application });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    if (error instanceof DataNotFoundError) {
      return NextResponse.json({ error: "Application not found." }, { status: 404 });
    }
    if (error instanceof DataConflictError) {
      return NextResponse.json({ error: "Could not attach this CV." }, { status: 409 });
    }
    return NextResponse.json({ error: "Could not attach CV." }, { status: 500 });
  }
}
