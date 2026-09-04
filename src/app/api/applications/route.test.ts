import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getDataRepository: vi.fn(),
  createApplication: vi.fn(),
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
import { DataConflictError, DataNotFoundError } from "@/lib/data";
import { POST } from "./route";

const validApplication = {
  title: "ML Engineer",
  company: "Northstar",
  description: "Build and operate reliable machine-learning systems in production.",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "owner-id" });
  mocks.getDataRepository.mockResolvedValue({
    createApplication: mocks.createApplication,
  });
  mocks.createApplication.mockResolvedValue({
    id: "application-id",
    cvVersionId: null,
  });
});

describe("POST /api/applications", () => {
  it.each([
    "ftp://files.example/jobs/42",
    "javascript:alert(document.domain)",
  ])("rejects the non-HTTP source URL %s before storing the application", async sourceUrl => {
    const response = await POST(new Request("http://localhost/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validApplication, sourceUrl }),
    }));

    expect(response.status).toBe(400);
    expect(mocks.getDataRepository).not.toHaveBeenCalled();
    expect(mocks.createApplication).not.toHaveBeenCalled();
  });

  it.each([
    "http://jobs.example/roles/42",
    "https://jobs.example/roles/42",
  ])("stores the HTTP source URL %s", async sourceUrl => {
    const response = await POST(new Request("http://localhost/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validApplication, sourceUrl }),
    }));

    expect(response.status).toBe(201);
    expect(mocks.createApplication).toHaveBeenCalledWith(expect.objectContaining({
      job: expect.objectContaining({ sourceUrl, source: "url" }),
    }));
  });

  it("returns a stable validation error", async () => {
    const response = await POST(new Request("http://localhost/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validApplication, title: "" }),
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid application details." });
  });

  it("maps authentication, referenced-data, conflict, and backend failures safely", async () => {
    mocks.requireUser.mockRejectedValueOnce(new AuthRequiredError());
    expect((await POST(new Request("http://localhost/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validApplication),
    }))).status).toBe(401);

    mocks.createApplication.mockRejectedValueOnce(new DataNotFoundError("CV version", "private"));
    const missing = await POST(new Request("http://localhost/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validApplication),
    }));
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "CV version not found." });

    mocks.createApplication.mockRejectedValueOnce(new DataConflictError("private conflict"));
    expect((await POST(new Request("http://localhost/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validApplication),
    }))).status).toBe(409);

    mocks.createApplication.mockRejectedValueOnce(new Error("private database detail"));
    const failure = await POST(new Request("http://localhost/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validApplication),
    }));
    expect(failure.status).toBe(500);
    expect(await failure.json()).toEqual({ error: "Could not create application." });
  });
});
