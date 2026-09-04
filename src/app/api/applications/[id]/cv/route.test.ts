import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getDataRepository: vi.fn(),
  getCvVersion: vi.fn(),
  updateApplicationCv: vi.fn(),
  runAutomations: vi.fn(),
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
vi.mock("@/lib/services/run-automations", () => ({ runAutomations: mocks.runAutomations }));

import { AuthRequiredError } from "@/lib/auth";
import { DataNotFoundError } from "@/lib/data";
import { PATCH } from "./route";

const APPLICATION_ID = "10000000-0000-4000-8000-000000000001";
const CV_ID = "20000000-0000-4000-8000-000000000002";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "owner-id" });
  mocks.getDataRepository.mockResolvedValue({
    getCvVersion: mocks.getCvVersion,
    updateApplicationCv: mocks.updateApplicationCv,
  });
  mocks.getCvVersion.mockResolvedValue({ id: CV_ID });
  mocks.updateApplicationCv.mockResolvedValue({ id: APPLICATION_ID, cvVersionId: CV_ID });
  mocks.runAutomations.mockResolvedValue({});
});

function invoke(body: unknown, id = APPLICATION_ID) {
  return PATCH(new Request(`http://localhost/api/applications/${id}/cv`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }), { params: Promise.resolve({ id }) });
}

describe("PATCH /api/applications/[id]/cv", () => {
  it("attaches an owner-scoped CV and runs automation", async () => {
    const response = await invoke({ cvVersionId: CV_ID });
    expect(response.status).toBe(200);
    expect(mocks.updateApplicationCv).toHaveBeenCalledWith(APPLICATION_ID, CV_ID);
    expect(mocks.runAutomations).toHaveBeenCalledWith(expect.anything(), "owner-id");
  });

  it("normalizes invalid, missing, and foreign-owned identifiers", async () => {
    expect((await invoke({ cvVersionId: CV_ID }, "not-a-uuid")).status).toBe(404);
    expect((await invoke({ cvVersionId: "not-a-uuid" })).status).toBe(400);

    mocks.getCvVersion.mockResolvedValueOnce(null);
    expect((await invoke({ cvVersionId: CV_ID })).status).toBe(404);

    mocks.updateApplicationCv.mockRejectedValueOnce(
      new DataNotFoundError("Application", APPLICATION_ID),
    );
    expect((await invoke({ cvVersionId: null })).status).toBe(404);
  });

  it("maps authentication and backend failures safely", async () => {
    mocks.requireUser.mockRejectedValueOnce(new AuthRequiredError());
    expect((await invoke({ cvVersionId: null })).status).toBe(401);

    mocks.updateApplicationCv.mockRejectedValueOnce(new Error("private database detail"));
    const failure = await invoke({ cvVersionId: null });
    expect(failure.status).toBe(500);
    expect(await failure.json()).toEqual({ error: "Could not attach CV." });
  });
});
