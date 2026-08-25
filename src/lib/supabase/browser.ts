import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "./database.types";
import { getSupabasePublicConfig } from "./env";

let browserClient: ReturnType<typeof createBrowserClient<Database>> | undefined;

/** Returns one typed Supabase client per browser tab. */
export function createClient() {
  const { url, key } = getSupabasePublicConfig();
  browserClient ??= createBrowserClient<Database>(url, key);
  return browserClient;
}

