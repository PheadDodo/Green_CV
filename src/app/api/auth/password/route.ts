import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({ password: z.string().min(8).max(128) });

export async function PATCH(request: Request) {
  try {
    await requireUser();
    const { password } = schema.parse(await request.json());
    if (!isSupabaseConfigured()) return NextResponse.json({ updated: true, demo: true });
    const client = await createClient();
    const { error } = await client.auth.updateUser({ password });
    if (error) throw error;
    return NextResponse.json({ updated: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update password." }, { status: 400 });
  }
}
