function legacyJwtRole(key: string): string | null {
  const payload = key.split(".")[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const parsed = JSON.parse(atob(base64)) as { role?: unknown };
    return typeof parsed.role === "string" ? parsed.role : null;
  } catch {
    return null;
  }
}

export function assertPublicSupabaseKey(key: string): void {
  if (key.startsWith("sb_secret_") || legacyJwtRole(key) === "service_role") {
    throw new Error(
      "A server secret was placed in a public Supabase variable. Rotate it immediately and use an sb_publishable_ or legacy anon key.",
    );
  }
}

export function assertAdminSupabaseKey(key: string): void {
  if (key.startsWith("sb_secret_") || legacyJwtRole(key) === "service_role") return;
  throw new Error(
    "SUPABASE_SECRET_KEY must contain an sb_secret_ key or legacy service_role key, not a publishable/anon key.",
  );
}
