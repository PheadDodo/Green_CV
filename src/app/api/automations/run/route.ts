import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getDataRepository } from "@/lib/data";
import { runAutomations } from "@/lib/services/run-automations";

export async function POST() {
  try {
    const user = await requireUser();
    const repository = await getDataRepository({ userId: user.id });
    return NextResponse.json(await runAutomations(repository, user.id));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Automation run failed." }, { status: 500 });
  }
}
