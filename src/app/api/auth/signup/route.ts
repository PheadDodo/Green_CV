import { NextResponse } from "next/server";
import { z } from "zod";
import { getAppOrigin } from "@/lib/app-origin";
import { signUpWithPassword } from "@/lib/auth";
import { isEmailAllowedForSignup } from "@/lib/signup-policy";

const schema = z.object({ email: z.string().email(), password: z.string().min(8), name: z.string().min(2).max(100) });

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    if (!isEmailAllowedForSignup(input.email)) {
      return NextResponse.json(
        { error: "Account creation is not available for this email." },
        { status: 403 },
      );
    }
    const origin = getAppOrigin(request.url);
    const result = await signUpWithPassword(
      input.email,
      input.password,
      input.name,
      `${origin}/auth/callback?next=/dashboard`,
    );
    return NextResponse.json(result.requiresEmailConfirmation ? { message: "Check your email to confirm the account, then sign in." } : result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Sign up failed." }, { status: 400 });
  }
}
