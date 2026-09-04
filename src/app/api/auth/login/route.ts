import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthRequiredError, signInWithPassword } from "@/lib/auth";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
}).strict();

function hasAuthCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 400 },
    );
  }

  try {
    const input = parsed.data;
    const user = await signInWithPassword(input.email, input.password);
    return NextResponse.json({ user });
  } catch (error) {
    if (hasAuthCode(error, "invalid_credentials")) {
      return NextResponse.json(
        { error: "Email or password is incorrect." },
        { status: 401 },
      );
    }
    if (hasAuthCode(error, "email_not_confirmed")) {
      return NextResponse.json(
        { error: "Confirm your email before signing in." },
        { status: 403 },
      );
    }
    if (hasAuthCode(error, "over_request_rate_limit")) {
      return NextResponse.json(
        { error: "Too many sign-in attempts. Try again later." },
        { status: 429 },
      );
    }
    if (error instanceof AuthRequiredError) {
      return NextResponse.json(
        { error: "This account is not authorized for this workspace." },
        { status: 403 },
      );
    }
    return NextResponse.json(
      { error: "Sign in is temporarily unavailable." },
      { status: 502 },
    );
  }
}
