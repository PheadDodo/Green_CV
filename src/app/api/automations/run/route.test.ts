import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getDataRepository: vi.fn(),
  runAutomations: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  AuthRequiredError: class AuthRequiredError extends Error {},
  requireUser: mocks.requireUser,
}));
vi.mock("@/lib/data", () => ({ getDataRepository: mocks.getDataRepository }));
vi.mock("@/lib/services/run-automations", () => ({ runAutomations: mocks.runAutomations }));

import { AuthRequiredError } from "@/lib/auth";
import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "owner-id" });
  mocks.getDataRepository.mockResolvedValue({ repository: true });
  mocks.runAutomations.mockResolvedValue({
    evaluated: 2,
    intents: 1,
    succeeded: 1,
    failed: 0,
    skipped: 0,
  });
});

describe("POST /api/automations/run", () => {
  it("runs owner-scoped automation", async () => {
    const response = await POST();
    expect(response.status).toBe(200);
    expect(mocks.getDataRepository).toHaveBeenCalledWith({ userId: "owner-id" });
  });

  it("maps authentication and backend failures safely", async () => {
    mocks.requireUser.mockRejectedValueOnce(new AuthRequiredError());
    expect((await POST()).status).toBe(401);

    mocks.runAutomations.mockRejectedValueOnce(new Error("private database detail"));
    const failure = await POST();
    expect(failure.status).toBe(500);
    expect(await failure.json()).toEqual({ error: "Automation run failed." });
  });
});
