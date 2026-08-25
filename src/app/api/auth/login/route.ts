import { NextResponse } from "next/server";
import { z } from "zod";
import { signInWithPassword } from "@/lib/auth";

const schema = z.object({ email: z.string().email(), password: z.string().min(8) });

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const user = await signInWithPassword(input.email, input.password);
    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Sign in failed." }, { status: 400 });
  }
}
