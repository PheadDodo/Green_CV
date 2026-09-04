import { NextResponse } from "next/server";
import { z } from "zod";

import { AuthRequiredError, requireUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({ password: z.string().min(8).max(128) }).strict();

export async function PATCH(request: Request) {
  try {
    await requireUser();
    const parsed = schema.safeParse(await request.json().catch(() => undefined));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid password." }, { status: 400 });
    }
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { error: "Password management requires a configured account service." },
        { status: 503 },
      );
    }

    const client = await createClient();
    const { error } = await client.auth.updateUser({ password: parsed.data.password });
    if (error) throw error;
    return NextResponse.json({ updated: true });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    return NextResponse.json({ error: "Could not update password." }, { status: 502 });
  }
}
