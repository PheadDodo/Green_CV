import { NextResponse } from "next/server";
import { getAppOrigin } from "@/lib/app-origin";
import { getSafeRedirectPath } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = getAppOrigin(request.url);
  const code = url.searchParams.get("code");
  const next = getSafeRedirectPath(url.searchParams.get("next"));
  if (!code) {
    return NextResponse.redirect(new URL("/login?error=invalid_auth_link", origin));
  }

  try {
    const client = await createClient();
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error) throw error;
  } catch {
    return NextResponse.redirect(new URL("/login?error=auth_callback_failed", origin));
  }

  return NextResponse.redirect(new URL(next, origin));
}
