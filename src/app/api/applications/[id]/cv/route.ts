import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getDataRepository } from "@/lib/data";
import { runAutomations } from "@/lib/services/run-automations";

const schema = z.object({ cvVersionId: z.string().uuid().nullable() });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [{ id }, user, input] = await Promise.all([params, requireUser(), request.json().then(value => schema.parse(value))]);
    const repository = await getDataRepository({ userId: user.id });
    if (input.cvVersionId && !(await repository.getCvVersion(input.cvVersionId))) return NextResponse.json({ error: "CV version not found." }, { status: 404 });
    const application = await repository.updateApplicationCv(id, input.cvVersionId);
    if (input.cvVersionId) await runAutomations(repository, user.id);
    return NextResponse.json({ application });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not attach CV." }, { status: 400 });
  }
}
