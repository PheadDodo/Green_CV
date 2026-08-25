import { assertPublicSupabaseKey } from "./keys";

export interface SupabasePublicConfig {
  url: string;
  key: string;
}

function publicValues(): SupabasePublicConfig {
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";
  const legacyAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
  if (publishableKey) assertPublicSupabaseKey(publishableKey);
  if (legacyAnonKey) assertPublicSupabaseKey(legacyAnonKey);
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "",
    key: publishableKey || legacyAnonKey,
  };
}

export function isSupabaseConfigured(): boolean {
  const { url, key } = publicValues();
  if (Boolean(url) !== Boolean(key)) {
    throw new Error("Supabase configuration is incomplete. Set both NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or legacy NEXT_PUBLIC_SUPABASE_ANON_KEY), or leave both blank during development.");
  }
  if (url) {
    let parsed: URL;
    try { parsed = new URL(url); } catch { throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid URL."); }
    if (parsed.protocol !== "https:" && parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") throw new Error("NEXT_PUBLIC_SUPABASE_URL must use HTTPS outside local development.");
  }
  if (!url && process.env.NODE_ENV === "production") {
    throw new Error(
      "Supabase is required in production. Local demo storage is available only during development.",
    );
  }
  return Boolean(url && key);
}

export function getSupabasePublicConfig(): SupabasePublicConfig {
  const { url, key } = publicValues();

  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY).",
    );
  }

  return { url, key };
}
