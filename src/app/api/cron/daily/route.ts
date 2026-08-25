import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getDataRepository } from "@/lib/data";
import { DEMO_USER_ID } from "@/lib/data/seed";
import type { Database } from "@/lib/supabase/database.types";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { runAutomations } from "@/lib/services/run-automations";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    if (!isSupabaseConfigured()) {
      const repository = await getDataRepository({ forceLocal: true, userId: DEMO_USER_ID });
      return NextResponse.json({ users: 1, results: [await runAutomations(repository, DEMO_USER_ID)] });
    }
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!serviceKey || !url) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for scheduled automation.");
    const admin = createClient<Database>(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await admin.from("automation_rules").select("user_id").eq("enabled", true);
    if (error) throw error;
    const userIds = [...new Set((data ?? []).map(row => row.user_id))];
    const results = [];
    for (const userId of userIds) {
      const repository = await getDataRepository({ userId, supabaseClient: admin });
      results.push(await runAutomations(repository, userId));
    }
    return NextResponse.json({ users: userIds.length, results });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Scheduled automation failed." }, { status: 500 });
  }
}
