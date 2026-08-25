import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";
import { assertAdminSupabaseKey } from "./keys";

/** This module is server-only by usage: never import it from a Client Component. */
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secretKey =
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !secretKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY) are required for scheduled automation.",
    );
  }
  assertAdminSupabaseKey(secretKey);

  return createClient<Database>(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
