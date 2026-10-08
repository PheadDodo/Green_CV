import { NextResponse } from "next/server";
import { AuthRequiredError, requireUser } from "@/lib/auth";
import { getDataRepository } from "@/lib/data";
import { getPublicLlmSettings, LlmSettingsValidationError, saveLlmSettings } from "@/lib/llm/settings";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    const repository = await getDataRepository({ userId: user.id });
    return NextResponse.json({ settings: await getPublicLlmSettings(repository) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthRequiredError) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    return NextResponse.json({ error: "Could not load LLM settings." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireUser();
    const input: unknown = await request.json().catch(() => undefined);
    const repository = await getDataRepository({ userId: user.id });
    const settings = await saveLlmSettings(repository, input);
    return NextResponse.json({ settings }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthRequiredError) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (error instanceof LlmSettingsValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ error: "Could not save LLM settings. Check the server’s LLM settings encryption configuration." }, { status: 500 });
  }
}
