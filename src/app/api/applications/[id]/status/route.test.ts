import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getDataRepository: vi.fn(),
  updateApplicationStatus: vi.fn(),
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

const APPLICATION_ID = "10000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "owner-id" });
  mocks.getDataRepository.mockResolvedValue({
    updateApplicationStatus: mocks.updateApplicationStatus,
  });
  mocks.updateApplicationStatus.mockResolvedValue({ id: APPLICATION_ID, status: "applied" });
});

function invoke(body: unknown, id = APPLICATION_ID) {
  return PATCH(new Request(`http://localhost/api/applications/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }), { params: Promise.resolve({ id }) });
}

describe("PATCH /api/applications/[id]/status", () => {
  it("updates an owner-scoped application status", async () => {
    const response = await invoke({ status: "applied", notes: "Submitted" });
    expect(response.status).toBe(200);
    expect(mocks.updateApplicationStatus).toHaveBeenCalledWith(
      APPLICATION_ID,
      "applied",
      "Submitted",
    );
  });

  it("normalizes invalid and missing application identifiers", async () => {
    expect((await invoke({ status: "applied" }, "not-a-uuid")).status).toBe(404);

    mocks.updateApplicationStatus.mockRejectedValueOnce(
      new DataNotFoundError("Application", APPLICATION_ID),
    );
    const missing = await invoke({ status: "applied" });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "Application not found." });
  });

  it("maps invalid, unauthenticated, conflict, and backend failures safely", async () => {
    expect((await invoke({ status: "unknown" })).status).toBe(400);

    mocks.requireUser.mockRejectedValueOnce(new AuthRequiredError());
    expect((await invoke({ status: "applied" })).status).toBe(401);

    mocks.updateApplicationStatus.mockRejectedValueOnce(new DataConflictError("private state"));
    expect((await invoke({ status: "applied" })).status).toBe(409);

    mocks.updateApplicationStatus.mockRejectedValueOnce(new Error("private database detail"));
    const failure = await invoke({ status: "applied" });
    expect(failure.status).toBe(500);
    expect(await failure.json()).toEqual({ error: "Could not update application status." });
  });
});
