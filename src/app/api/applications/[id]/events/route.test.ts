import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getDataRepository: vi.fn(),
  getApplication: vi.fn(),
  updateApplicationStatus: vi.fn(),
  createApplicationEvent: vi.fn(),
  runAutomations: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  AuthRequiredError: class AuthRequiredError extends Error {},
  requireUser: mocks.requireUser,
}));
vi.mock("@/lib/data", () => ({
  DataNotFoundError: class DataNotFoundError extends Error {},
  getDataRepository: mocks.getDataRepository,
}));
vi.mock("@/lib/services/run-automations", () => ({
  runAutomations: mocks.runAutomations,
}));

import { AuthRequiredError } from "@/lib/auth";
import { POST } from "./route";

const APPLICATION_ID = "10000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "owner-id" });
  mocks.getDataRepository.mockResolvedValue({
    getApplication: mocks.getApplication,
    updateApplicationStatus: mocks.updateApplicationStatus,
    createApplicationEvent: mocks.createApplicationEvent,
  });
  mocks.getApplication.mockResolvedValue({ id: APPLICATION_ID, status: "applied" });
  mocks.updateApplicationStatus.mockResolvedValue({ id: APPLICATION_ID, status: "interview" });
  mocks.createApplicationEvent.mockResolvedValue({ id: "event-id" });
  mocks.runAutomations.mockResolvedValue({});
});

function invoke(body: unknown) {
  return POST(new Request(`http://localhost/api/applications/${APPLICATION_ID}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }), { params: Promise.resolve({ id: APPLICATION_ID }) });
}

describe("POST /api/applications/[id]/events", () => {
  it("rejects timezone-less interview dates", async () => {
    const response = await invoke({
      kind: "interview",
      interviewAt: "2099-09-05T14:30",
      notes: "Technical interview",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid activity details." });
    expect(mocks.getDataRepository).not.toHaveBeenCalled();
  });

  it("stores an offset-bearing interview date as a UTC instant", async () => {
    const response = await invoke({
      kind: "interview",
      interviewAt: "2099-09-05T14:30:00+02:00",
      notes: "Technical interview",
    });

    expect(response.status).toBe(201);
    expect(mocks.createApplicationEvent).toHaveBeenCalledWith(expect.objectContaining({
      metadata: { interviewAt: "2099-09-05T12:30:00.000Z" },
    }));
  });

  it("maps authentication and unexpected failures safely", async () => {
    mocks.requireUser.mockRejectedValueOnce(new AuthRequiredError());
    expect((await invoke({ kind: "note", notes: "Hello" })).status).toBe(401);

    mocks.getApplication.mockRejectedValueOnce(new Error("private database detail"));
    const failure = await invoke({ kind: "note", notes: "Hello" });
    expect(failure.status).toBe(500);
    expect(await failure.json()).toEqual({ error: "Could not record activity." });
  });
});
