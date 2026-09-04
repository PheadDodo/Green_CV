import { NextResponse } from "next/server";
import { z } from "zod";
import { getAppOrigin } from "@/lib/app-origin";
import { signUpWithPassword } from "@/lib/auth";
import { isEmailAllowedForSignup } from "@/lib/signup-policy";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(2).max(100),
}).strict();

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid account details." }, { status: 400 });
  }

  const input = parsed.data;
  let origin: string;
  try {
    if (!isEmailAllowedForSignup(input.email)) {
      return NextResponse.json(
        { error: "Account creation is not available for this email." },
        { status: 403 },
      );
    }
    origin = getAppOrigin(request.url);
  } catch {
    return NextResponse.json(
      { error: "Account creation is temporarily unavailable." },
      { status: 500 },
    );
  }

  try {
    const result = await signUpWithPassword(
      input.email,
      input.password,
      input.name,
      `${origin}/auth/callback?next=/dashboard`,
    );
    return NextResponse.json(
      result.requiresEmailConfirmation
        ? { message: "Check your email to confirm the account, then sign in." }
        : result,
    );
  } catch {
    return NextResponse.json(
      { error: "Account creation is temporarily unavailable." },
      { status: 502 },
    );
  }
}
