import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getDataRepository: vi.fn(),
  upsertAutomationRule: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  AuthRequiredError: class AuthRequiredError extends Error {},
  requireUser: mocks.requireUser,
}));
vi.mock("@/lib/data", () => ({
  DataConflictError: class DataConflictError extends Error {},
  DataNotFoundError: class DataNotFoundError extends Error {},
  getDataRepository: mocks.getDataRepository,
}));

import { AuthRequiredError } from "@/lib/auth";
import { DataConflictError, DataNotFoundError } from "@/lib/data";
import { PATCH } from "./route";

const RULE_ID = "10000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "owner-id" });
  mocks.getDataRepository.mockResolvedValue({ upsertAutomationRule: mocks.upsertAutomationRule });
  mocks.upsertAutomationRule.mockImplementation(async (input) => ({ id: RULE_ID, ...input }));
});

function request(body: unknown) {
  return new Request("http://localhost/api/automations/rules", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/automations/rules", () => {
  it("accepts only the canonical follow-up timing configuration", async () => {
    const input = {
      id: RULE_ID,
      type: "follow_up",
      enabled: true,
      config: { delayHours: 240 },
    };
    const response = await PATCH(request(input));

    expect(response.status).toBe(200);
    expect(mocks.upsertAutomationRule).toHaveBeenCalledWith(input);
  });

  it("protects auto-evaluation configuration from this settings API", async () => {
    const response = await PATCH(request({
      id: RULE_ID,
      type: "auto_evaluate",
      enabled: true,
      config: { minimumDescriptionLength: 1 },
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid automation rule settings." });
    expect(mocks.getDataRepository).not.toHaveBeenCalled();
  });

  it("rejects out-of-range and unknown reminder settings", async () => {
    for (const body of [
      { id: RULE_ID, type: "follow_up", enabled: true, config: { delayHours: 0 } },
      { id: RULE_ID, type: "interview_prep", enabled: true, config: { leadHours: 169 } },
      { id: RULE_ID, type: "follow_up", enabled: true, config: { delayHours: 24, extra: true } },
    ]) {
      const response = await PATCH(request(body));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "Invalid automation rule settings." });
    }
    expect(mocks.getDataRepository).not.toHaveBeenCalled();
  });

  it("maps authentication, ownership, conflict, and backend failures safely", async () => {
    mocks.requireUser.mockRejectedValueOnce(new AuthRequiredError());
    expect((await PATCH(request({ type: "auto_evaluate", enabled: false }))).status).toBe(401);

    mocks.upsertAutomationRule.mockRejectedValueOnce(new DataNotFoundError("Automation rule", RULE_ID));
    expect((await PATCH(request({ id: RULE_ID, type: "follow_up", enabled: true }))).status).toBe(404);

    mocks.upsertAutomationRule.mockRejectedValueOnce(new DataConflictError("private conflict detail"));
    const conflict = await PATCH(request({ id: RULE_ID, type: "follow_up", enabled: true }));
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({ error: "Automation rule conflicts with existing settings." });

    mocks.upsertAutomationRule.mockRejectedValueOnce(new Error("private database detail"));
    const failure = await PATCH(request({ id: RULE_ID, type: "follow_up", enabled: true }));
    expect(failure.status).toBe(500);
    expect(await failure.json()).toEqual({ error: "Could not update automation rule." });
  });
});
