import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getDataRepository: vi.fn(),
  cancelAutomationRun: vi.fn(),
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
import { DELETE } from "./route";

const RUN_ID = "10000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "owner-id" });
  mocks.getDataRepository.mockResolvedValue({ cancelAutomationRun: mocks.cancelAutomationRun });
  mocks.cancelAutomationRun.mockResolvedValue({ id: RUN_ID, status: "cancelled" });
});

function invoke(id = RUN_ID) {
  return DELETE(new Request(`http://localhost/api/automations/runs/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ id }),
  });
}

describe("DELETE /api/automations/runs/[id]", () => {
  it("cancels an owner-scoped retry through the repository transition", async () => {
    const response = await invoke();
    expect(response.status).toBe(200);
    expect(mocks.getDataRepository).toHaveBeenCalledWith({ userId: "owner-id" });
    expect(mocks.cancelAutomationRun).toHaveBeenCalledWith(RUN_ID);
  });

  it("normalizes invalid, missing, and foreign run identifiers to not found", async () => {
    const invalid = await invoke("not-a-uuid");
    expect(invalid.status).toBe(404);
    expect(mocks.getDataRepository).not.toHaveBeenCalled();

    mocks.cancelAutomationRun.mockRejectedValueOnce(new DataNotFoundError("Automation run", RUN_ID));
    const missing = await invoke();
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "Automation run not found." });
  });

  it("returns conflict when the run can no longer be cancelled", async () => {
    mocks.cancelAutomationRun.mockRejectedValue(new DataConflictError("private state detail"));
    const response = await invoke();
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "This automation run can no longer be cancelled." });
  });

  it("maps authentication and unexpected failures safely", async () => {
    mocks.requireUser.mockRejectedValueOnce(new AuthRequiredError());
    expect((await invoke()).status).toBe(401);

    mocks.cancelAutomationRun.mockRejectedValueOnce(new Error("private database detail"));
    const failure = await invoke();
    expect(failure.status).toBe(500);
    expect(await failure.json()).toEqual({ error: "Could not cancel automation run." });
  });
});
