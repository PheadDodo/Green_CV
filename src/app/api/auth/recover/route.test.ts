import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getAppOrigin: vi.fn(),
  resetPasswordForEmail: vi.fn(),
}));

vi.mock("@/lib/app-origin", () => ({ getAppOrigin: mocks.getAppOrigin }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAppOrigin.mockReturnValue("https://greencv.example");
  mocks.resetPasswordForEmail.mockResolvedValue({ error: null });
  mocks.createClient.mockResolvedValue({
    auth: { resetPasswordForEmail: mocks.resetPasswordForEmail },
  });
});

function request(body: unknown) {
  return new Request("https://greencv.example/api/auth/recover", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const publicMessage = {
  message: "If that account exists, a recovery link is on its way.",
};

describe("POST /api/auth/recover", () => {
  it("rejects malformed and unexpected recovery requests with one stable response", async () => {
    const malformed = await POST(request("{"));
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({ error: "Invalid email address." });

    const unexpected = await POST(request({ email: "person@example.com", admin: true }));
    expect(unexpected.status).toBe(400);
    expect(await unexpected.json()).toEqual({ error: "Invalid email address." });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("sends recovery through the trusted callback and returns non-enumerating copy", async () => {
    const response = await POST(request({ email: "person@example.com" }));

    expect(response.status).toBe(200);
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith(
      "person@example.com",
      {
        redirectTo:
          "https://greencv.example/auth/callback?next=/settings/account",
      },
    );
    expect(await response.json()).toEqual(publicMessage);
  });

  it("does not reveal provider account details through recovery responses", async () => {
    mocks.resetPasswordForEmail.mockResolvedValue({
      error: new Error("No user exists for private-address@example.com"),
    });

    const response = await POST(request({ email: "private-address@example.com" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(publicMessage);
  });

  it("does not expose account-service configuration through recovery responses", async () => {
    mocks.createClient.mockRejectedValue(
      new Error("NEXT_PUBLIC_SUPABASE_URL contains private configuration"),
    );

    const response = await POST(request({ email: "person@example.com" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(publicMessage);
  });
});
