import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getDataRepository: vi.fn(),
  completeReminder: vi.fn(),
  dismissReminder: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  AuthRequiredError: class AuthRequiredError extends Error {},
  requireUser: mocks.requireUser,
}));
vi.mock("@/lib/data", () => ({
  DataNotFoundError: class DataNotFoundError extends Error {},
  getDataRepository: mocks.getDataRepository,
}));

import { PATCH } from "./route";
import { DataNotFoundError } from "@/lib/data";

const REMINDER_ID = "10000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "owner-id" });
  mocks.getDataRepository.mockResolvedValue({
    completeReminder: mocks.completeReminder,
    dismissReminder: mocks.dismissReminder,
  });
  mocks.completeReminder.mockResolvedValue({
    id: REMINDER_ID,
    status: "completed",
  });
  mocks.dismissReminder.mockResolvedValue({
    id: REMINDER_ID,
    status: "dismissed",
  });
});

describe("PATCH /api/reminders/[id]", () => {
  it("completes an owner-scoped reminder", async () => {
    const response = await PATCH(new Request("http://localhost/api/reminders/id", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    }), { params: Promise.resolve({ id: REMINDER_ID }) });

    expect(response.status).toBe(200);
    expect(mocks.getDataRepository).toHaveBeenCalledWith({ userId: "owner-id" });
    expect(mocks.completeReminder).toHaveBeenCalledWith(REMINDER_ID);
    expect(await response.json()).toEqual({ updated: true, status: "completed" });
  });

  it("dismisses an owner-scoped reminder", async () => {
    const response = await PATCH(new Request("http://localhost/api/reminders/id", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "dismissed" }),
    }), { params: Promise.resolve({ id: REMINDER_ID }) });

    expect(response.status).toBe(200);
    expect(mocks.getDataRepository).toHaveBeenCalledWith({ userId: "owner-id" });
    expect(mocks.dismissReminder).toHaveBeenCalledWith(REMINDER_ID);
    expect(await response.json()).toEqual({ updated: true, status: "dismissed" });
  });

  it("rejects non-terminal status updates without touching reminder data", async () => {
    const response = await PATCH(new Request("http://localhost/api/reminders/id", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "pending" }),
    }), { params: Promise.resolve({ id: REMINDER_ID }) });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid reminder update." });
    expect(mocks.getDataRepository).not.toHaveBeenCalled();
  });

  it("does not reveal reminders outside the authenticated owner scope", async () => {
    mocks.completeReminder.mockRejectedValue(new DataNotFoundError("Reminder", REMINDER_ID));

    const response = await PATCH(new Request("http://localhost/api/reminders/id", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    }), { params: Promise.resolve({ id: REMINDER_ID }) });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Reminder not found." });
  });
});
