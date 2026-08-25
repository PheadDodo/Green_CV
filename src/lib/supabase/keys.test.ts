import { describe, expect, it } from "vitest";

import { assertAdminSupabaseKey, assertPublicSupabaseKey } from "./keys";

function legacyKey(role: string): string {
  const payload = btoa(JSON.stringify({ role })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `header.${payload}.signature`;
}

describe("Supabase key placement", () => {
  it("accepts browser-safe key classes", () => {
    expect(() => assertPublicSupabaseKey("sb_publishable_example")).not.toThrow();
    expect(() => assertPublicSupabaseKey(legacyKey("anon"))).not.toThrow();
  });

  it("rejects both modern and legacy server secrets in public variables", () => {
    expect(() => assertPublicSupabaseKey("sb_secret_example")).toThrow(/server secret/i);
    expect(() => assertPublicSupabaseKey(legacyKey("service_role"))).toThrow(/server secret/i);
  });

  it("requires a server key for the admin client", () => {
    expect(() => assertAdminSupabaseKey("sb_secret_example")).not.toThrow();
    expect(() => assertAdminSupabaseKey(legacyKey("service_role"))).not.toThrow();
    expect(() => assertAdminSupabaseKey("sb_publishable_example")).toThrow(/not a publishable/i);
  });
});
