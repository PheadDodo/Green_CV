import { NextResponse } from "next/server";
import { z } from "zod";
import { getAppOrigin } from "@/lib/app-origin";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({ email: z.string().email() });

export async function POST(request: Request) {
  try {
    const { email } = schema.parse(await request.json());
    const client = await createClient();
    const origin = getAppOrigin(request.url);
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/callback?next=/settings/account` });
    if (error) throw error;
    return NextResponse.json({ message: "If that account exists, a recovery link is on its way." });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not send recovery email." }, { status: 400 });
  }
}
