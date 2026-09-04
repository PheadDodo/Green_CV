import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getDataRepository: vi.fn(),
  deleteApplication: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  AuthRequiredError: class AuthRequiredError extends Error {},
  requireUser: mocks.requireUser,
}));

vi.mock("@/lib/data", () => ({
  DataNotFoundError: class DataNotFoundError extends Error {},
  getDataRepository: mocks.getDataRepository,
}));

import { AuthRequiredError } from "@/lib/auth";
import { DataNotFoundError } from "@/lib/data";
import { DELETE } from "./route";

const APPLICATION_ID = "10000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "owner-id" });
  mocks.getDataRepository.mockResolvedValue({
    deleteApplication: mocks.deleteApplication,
  });
  mocks.deleteApplication.mockResolvedValue(undefined);
});

describe("DELETE /api/applications/[id]", () => {
  it("permanently deletes an owner-scoped application", async () => {
    const response = await DELETE(
      new Request(`http://localhost/api/applications/${APPLICATION_ID}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: APPLICATION_ID }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.getDataRepository).toHaveBeenCalledWith({ userId: "owner-id" });
    expect(mocks.deleteApplication).toHaveBeenCalledWith(APPLICATION_ID);
    expect(await response.json()).toEqual({ deleted: true });
  });

  it("requires authentication", async () => {
    mocks.requireUser.mockRejectedValue(new AuthRequiredError());

    const response = await DELETE(
      new Request(`http://localhost/api/applications/${APPLICATION_ID}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: APPLICATION_ID }) },
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Authentication required." });
    expect(mocks.getDataRepository).not.toHaveBeenCalled();
  });

  it("treats malformed identifiers as not found", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/applications/not-an-id", { method: "DELETE" }),
      { params: Promise.resolve({ id: "not-an-id" }) },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Application not found." });
    expect(mocks.getDataRepository).not.toHaveBeenCalled();
    expect(mocks.deleteApplication).not.toHaveBeenCalled();
  });

  it("does not reveal whether an application belongs to another owner", async () => {
    mocks.deleteApplication.mockRejectedValue(new DataNotFoundError("Application", APPLICATION_ID));

    const response = await DELETE(
      new Request(`http://localhost/api/applications/${APPLICATION_ID}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: APPLICATION_ID }) },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Application not found." });
  });

  it("does not expose unexpected backend errors", async () => {
    mocks.deleteApplication.mockRejectedValue(new Error("private database detail"));

    const response = await DELETE(
      new Request(`http://localhost/api/applications/${APPLICATION_ID}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: APPLICATION_ID }) },
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Could not delete this application." });
  });
});
