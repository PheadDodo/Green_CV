import { NextResponse } from "next/server";
import { z } from "zod";
import { getAppOrigin } from "@/lib/app-origin";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({ email: z.string().email() }).strict();

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
  }

  try {
    const { email } = parsed.data;
    const client = await createClient();
    const origin = getAppOrigin(request.url);
    await client.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/callback?next=/settings/account`,
    });
  } catch {
    // Recovery responses intentionally do not reveal provider or account state.
  }

  return NextResponse.json({
    message: "If that account exists, a recovery link is on its way.",
  });
}
