import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getDataRepository } from "@/lib/data";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [{ id }, user] = await Promise.all([params, requireUser()]);
    const repository = await getDataRepository({ userId: user.id });
    const run = await repository.updateAutomationRun(id, { status: "cancelled", completedAt: new Date().toISOString() });
    return NextResponse.json({ run });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not cancel run." }, { status: 400 });
  }
}
