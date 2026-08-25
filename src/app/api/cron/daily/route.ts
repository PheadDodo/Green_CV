import { NextResponse } from "next/server";
import { verifyCronAuthorization } from "@/lib/cron-auth";
import { getDataRepository } from "@/lib/data";
import { DEMO_USER_ID } from "@/lib/data/seed";
import { isAccountAuthorized } from "@/lib/signup-policy";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { runAutomations } from "@/lib/services/run-automations";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authorization = verifyCronAuthorization(request.headers.get("authorization"));
  if (authorization === "misconfigured") {
    return NextResponse.json({ error: "Scheduled automation is not configured." }, { status: 503 });
  }
  if (authorization !== "authorized") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    if (!isSupabaseConfigured()) {
      const repository = await getDataRepository({ forceLocal: true, userId: DEMO_USER_ID });
      return NextResponse.json({ users: 1, results: [await runAutomations(repository, DEMO_USER_ID)] });
    }
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.from("automation_rules").select("user_id").eq("enabled", true);
    if (error) throw error;
    const candidateUserIds = [...new Set((data ?? []).map(row => row.user_id))];
    const userIds: string[] = [];
    for (const userId of candidateUserIds) {
      const { data: authData, error: authError } = await admin.auth.admin.getUserById(userId);
      if (authError) throw authError;
      if (isAccountAuthorized(authData.user.email)) userIds.push(userId);
    }
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
