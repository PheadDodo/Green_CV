import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAppOrigin: vi.fn(),
  isEmailAllowedForSignup: vi.fn(),
  signUpWithPassword: vi.fn(),
}));

vi.mock("@/lib/app-origin", () => ({ getAppOrigin: mocks.getAppOrigin }));
vi.mock("@/lib/auth", () => ({ signUpWithPassword: mocks.signUpWithPassword }));
vi.mock("@/lib/signup-policy", () => ({
  isEmailAllowedForSignup: mocks.isEmailAllowedForSignup,
}));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAppOrigin.mockReturnValue("https://greencv.example");
  mocks.isEmailAllowedForSignup.mockReturnValue(true);
  mocks.signUpWithPassword.mockResolvedValue({
    user: {
      id: "user-id",
      email: "person@example.com",
      displayName: "Person",
      avatarUrl: null,
      isDemo: false,
    },
    requiresEmailConfirmation: false,
  });
});

function request(body: unknown) {
  return new Request("https://greencv.example/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const validAccount = {
  email: "person@example.com",
  password: "a-secure-password",
  name: "Person",
};

describe("POST /api/auth/signup", () => {
  it("rejects malformed and unexpected account details with one stable response", async () => {
    const malformed = await POST(request("{"));
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({ error: "Invalid account details." });

    const unexpected = await POST(request({ ...validAccount, admin: true }));
    expect(unexpected.status).toBe(400);
    expect(await unexpected.json()).toEqual({ error: "Invalid account details." });
    expect(mocks.isEmailAllowedForSignup).not.toHaveBeenCalled();
    expect(mocks.signUpWithPassword).not.toHaveBeenCalled();
  });

  it("preserves the explicit private-workspace signup denial", async () => {
    mocks.isEmailAllowedForSignup.mockReturnValue(false);

    const response = await POST(request(validAccount));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Account creation is not available for this email.",
    });
    expect(mocks.signUpWithPassword).not.toHaveBeenCalled();
  });

  it("uses the trusted callback and returns the confirmation-safe message", async () => {
    mocks.signUpWithPassword.mockResolvedValue({
      user: { id: "pending-user" },
      requiresEmailConfirmation: true,
    });

    const response = await POST(request(validAccount));

    expect(response.status).toBe(200);
    expect(mocks.signUpWithPassword).toHaveBeenCalledWith(
      "person@example.com",
      "a-secure-password",
      "Person",
      "https://greencv.example/auth/callback?next=/dashboard",
    );
    expect(await response.json()).toEqual({
      message: "Check your email to confirm the account, then sign in.",
    });
  });

  it("sanitizes account-provider failures", async () => {
    mocks.signUpWithPassword.mockRejectedValue(
      new Error("provider disclosed that person@example.com already exists"),
    );

    const response = await POST(request(validAccount));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "Account creation is temporarily unavailable.",
    });
  });

  it("sanitizes local signup-policy configuration failures", async () => {
    mocks.isEmailAllowedForSignup.mockImplementation(() => {
      throw new Error("ALLOW_PUBLIC_SIGNUP included a private invalid value");
    });

    const response = await POST(request(validAccount));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Account creation is temporarily unavailable.",
    });
    expect(mocks.signUpWithPassword).not.toHaveBeenCalled();
  });
});
