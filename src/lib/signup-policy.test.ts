import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isAccountAuthorized,
  isEmailAllowedForSignup,
  isSignupEnabled,
} from "./signup-policy";

const originalPublicSignup = process.env.ALLOW_PUBLIC_SIGNUP;
const originalAuthorizedEmails = process.env.AUTHORIZED_EMAILS;

afterEach(() => {
  vi.unstubAllEnvs();
  restore("ALLOW_PUBLIC_SIGNUP", originalPublicSignup);
  restore("AUTHORIZED_EMAILS", originalAuthorizedEmails);
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe("sign-up policy", () => {
  it("allows convenient sign-up in local development", () => {
    vi.stubEnv("NODE_ENV", "development");
    delete process.env.ALLOW_PUBLIC_SIGNUP;
    delete process.env.AUTHORIZED_EMAILS;
    expect(isSignupEnabled()).toBe(true);
    expect(isEmailAllowedForSignup("person@example.com")).toBe(true);
  });

  it("fails closed in production by default", () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.ALLOW_PUBLIC_SIGNUP;
    delete process.env.AUTHORIZED_EMAILS;
    expect(isSignupEnabled()).toBe(false);
    expect(isEmailAllowedForSignup("person@example.com")).toBe(false);
    expect(isAccountAuthorized("person@example.com")).toBe(false);
  });

  it("supports a case-insensitive production allowlist", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.AUTHORIZED_EMAILS = "Owner@Example.com, teammate@example.com";
    expect(isSignupEnabled()).toBe(true);
    expect(isEmailAllowedForSignup("owner@example.com")).toBe(true);
    expect(isEmailAllowedForSignup("stranger@example.com")).toBe(false);
    expect(isAccountAuthorized("OWNER@example.com")).toBe(true);
    expect(isAccountAuthorized("stranger@example.com")).toBe(false);
  });
});
