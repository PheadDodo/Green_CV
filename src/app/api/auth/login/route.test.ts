import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  AuthRequiredError: class AuthRequiredError extends Error {},
  signInWithPassword: mocks.signInWithPassword,
}));

import { AuthRequiredError } from "@/lib/auth";
import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.signInWithPassword.mockResolvedValue({
    id: "user-id",
    email: "person@example.com",
    displayName: "Person",
    avatarUrl: null,
    isDemo: false,
  });
});

function request(body: unknown) {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/auth/login", () => {
  it("signs in with valid credentials", async () => {
    const response = await POST(request({
      email: "person@example.com",
      password: "a-secure-password",
    }));

    expect(response.status).toBe(200);
    expect(mocks.signInWithPassword).toHaveBeenCalledWith(
      "person@example.com",
      "a-secure-password",
    );
    expect(await response.json()).toMatchObject({
      user: { id: "user-id", email: "person@example.com" },
    });
  });

  it("rejects malformed and unexpected account credentials with one stable response", async () => {
    const malformed = await POST(request("{"));
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({ error: "Invalid email or password." });

    const unexpected = await POST(request({
      email: "person@example.com",
      password: "a-secure-password",
      admin: true,
    }));
    expect(unexpected.status).toBe(400);
    expect(await unexpected.json()).toEqual({ error: "Invalid email or password." });
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it("returns a safe credential message when the provider rejects the password", async () => {
    mocks.signInWithPassword.mockRejectedValue({
      code: "invalid_credentials",
      message: "private provider credential detail",
      status: 400,
    });

    const response = await POST(request({
      email: "person@example.com",
      password: "wrong-password",
    }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Email or password is incorrect." });
  });

  it("returns a useful authorization message when email confirmation is required", async () => {
    mocks.signInWithPassword.mockRejectedValue({
      code: "email_not_confirmed",
      message: "private provider confirmation detail",
      status: 400,
    });

    const response = await POST(request({
      email: "person@example.com",
      password: "a-secure-password",
    }));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Confirm your email before signing in.",
    });
  });

  it("returns a retryable status when the provider rate-limits sign in", async () => {
    mocks.signInWithPassword.mockRejectedValue({
      code: "over_request_rate_limit",
      message: "private provider limit detail",
      status: 429,
    });

    const response = await POST(request({
      email: "person@example.com",
      password: "a-secure-password",
    }));

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      error: "Too many sign-in attempts. Try again later.",
    });
  });

  it("explains workspace authorization denial without returning internal details", async () => {
    mocks.signInWithPassword.mockRejectedValue(
      new AuthRequiredError("private authorization implementation detail"),
    );

    const response = await POST(request({
      email: "person@example.com",
      password: "a-secure-password",
    }));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "This account is not authorized for this workspace.",
    });
  });

  it("sanitizes unexpected provider and configuration failures", async () => {
    mocks.signInWithPassword.mockRejectedValue(
      new Error("NEXT_PUBLIC_SUPABASE_URL contains a private deployment value"),
    );

    const response = await POST(request({
      email: "person@example.com",
      password: "a-secure-password",
    }));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "Sign in is temporarily unavailable.",
    });
  });
});
