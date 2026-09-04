import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  isSupabaseConfigured: vi.fn(),
  createClient: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  AuthRequiredError: class AuthRequiredError extends Error {},
  requireUser: mocks.requireUser,
}));
vi.mock("@/lib/supabase/env", () => ({
  isSupabaseConfigured: mocks.isSupabaseConfigured,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { AuthRequiredError } from "@/lib/auth";
import { PATCH } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "owner-id" });
  mocks.isSupabaseConfigured.mockReturnValue(true);
  mocks.updateUser.mockResolvedValue({ error: null });
  mocks.createClient.mockResolvedValue({ auth: { updateUser: mocks.updateUser } });
});

function request(password: unknown = "a-secure-password") {
  return new Request("http://localhost/api/auth/password", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
}

describe("PATCH /api/auth/password", () => {
  it("does not report a password update in local demo mode", async () => {
    mocks.isSupabaseConfigured.mockReturnValue(false);

    const response = await PATCH(request());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Password management requires a configured account service.",
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("updates a configured account password", async () => {
    const response = await PATCH(request());

    expect(response.status).toBe(200);
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: "a-secure-password" });
    expect(await response.json()).toEqual({ updated: true });
  });

  it("maps invalid, unauthenticated, and provider failures safely", async () => {
    expect((await PATCH(request("short"))).status).toBe(400);

    mocks.requireUser.mockRejectedValueOnce(new AuthRequiredError());
    expect((await PATCH(request())).status).toBe(401);

    mocks.updateUser.mockResolvedValueOnce({ error: new Error("private provider detail") });
    const providerFailure = await PATCH(request());
    expect(providerFailure.status).toBe(502);
    expect(await providerFailure.json()).toEqual({ error: "Could not update password." });
  });
});
