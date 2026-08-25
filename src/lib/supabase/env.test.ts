import { afterEach, describe, expect, it, vi } from "vitest";
import { isSupabaseConfigured } from "./env";

const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const originalPublishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

afterEach(() => {
  vi.unstubAllEnvs();
  restore("NEXT_PUBLIC_SUPABASE_URL", originalUrl);
  restore("NEXT_PUBLIC_SUPABASE_ANON_KEY", originalAnon);
  restore("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", originalPublishable);
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe("Supabase environment validation", () => {
  it("selects local mode when both public values are absent", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    expect(isSupabaseConfigured()).toBe(false);
  });

  it("rejects a partial configuration instead of silently using demo data", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    expect(() => isSupabaseConfigured()).toThrow(/incomplete/i);
  });

  it("accepts a complete HTTPS configuration", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-key";
    expect(isSupabaseConfigured()).toBe(true);
  });

  it("does not silently enable shared local storage in production", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    vi.stubEnv("NODE_ENV", "production");
    expect(() => isSupabaseConfigured()).toThrow(/required in production/i);
  });

  it("prefers the modern publishable key", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
    expect(isSupabaseConfigured()).toBe(true);
  });

  it("falls back to a legacy key when the modern variable is blank", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "legacy-anon-key";
    expect(isSupabaseConfigured()).toBe(true);
  });

  it("rejects a server secret copied into a public variable", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_secret_never_publish_this";
    expect(() => isSupabaseConfigured()).toThrow(/server secret/i);
  });

  it("rejects an exposed legacy secret even when a safe modern key takes precedence", () => {
    const payload = btoa(JSON.stringify({ role: "service_role" }));
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_safe";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = `header.${payload}.signature`;
    expect(() => isSupabaseConfigured()).toThrow(/server secret/i);
  });
});
