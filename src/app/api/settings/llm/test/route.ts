import { NextResponse } from "next/server";
import { AuthRequiredError, requireUser } from "@/lib/auth";
import { getDataRepository } from "@/lib/data";
import { testLlmConnection } from "@/lib/llm/connection";
import { LlmHttpError } from "@/lib/llm/http";
import { LlmSettingsValidationError, resolveLlmConfig } from "@/lib/llm/settings";

export const runtime = "nodejs";

export async function POST() {
  try {
    const user = await requireUser();
    const repository = await getDataRepository({ userId: user.id });
    const config = await resolveLlmConfig(repository);
    return NextResponse.json(await testLlmConnection(config), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthRequiredError) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (error instanceof LlmSettingsValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof LlmHttpError) return NextResponse.json({ error: error.message }, { status: 502 });
    return NextResponse.json({ error: "Could not verify the saved connection. Check the server address, API format, and credentials. Some providers do not expose a model list." }, { status: 502 });
  }
}
