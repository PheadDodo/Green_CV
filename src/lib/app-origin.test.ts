import { afterEach, describe, expect, it, vi } from "vitest";

import { getAppOrigin } from "./app-origin";

const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

afterEach(() => {
  vi.unstubAllEnvs();
  restore("NEXT_PUBLIC_APP_URL", originalAppUrl);
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe("getAppOrigin", () => {
  it("uses the request origin outside production when no origin is configured", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    vi.stubEnv("NODE_ENV", "test");
    expect(getAppOrigin("http://localhost:3000/api/auth/signup")).toBe("http://localhost:3000");
  });

  it("normalizes a configured trailing slash", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://jobs.example/";
    vi.stubEnv("NODE_ENV", "production");
    expect(getAppOrigin("https://untrusted.example/api/auth/signup")).toBe("https://jobs.example");
  });

  it("requires an explicit HTTPS origin in production", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    vi.stubEnv("NODE_ENV", "production");
    expect(() => getAppOrigin("https://jobs.example/api/auth/signup")).toThrow(/required/i);

    process.env.NEXT_PUBLIC_APP_URL = "http://jobs.example";
    expect(() => getAppOrigin("https://jobs.example/api/auth/signup")).toThrow(/HTTPS/i);
  });

  it("rejects configured URLs with extra path data", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://jobs.example/auth";
    expect(() => getAppOrigin("http://localhost:3000")).toThrow(/origin only/i);
  });
});
