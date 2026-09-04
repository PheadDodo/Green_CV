import { NextResponse } from "next/server";
import { AuthRequiredError, requireUser } from "@/lib/auth";
import { getDataRepository } from "@/lib/data";
import { runAutomations } from "@/lib/services/run-automations";

export async function POST() {
  try {
    const user = await requireUser();
    const repository = await getDataRepository({ userId: user.id });
    return NextResponse.json(await runAutomations(repository, user.id));
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    return NextResponse.json({ error: "Automation run failed." }, { status: 500 });
  }
}
