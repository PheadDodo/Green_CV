import { beforeEach, describe, expect, it, vi } from "vitest";

import { DataConflictError } from "@/lib/data/repository";

const mocks = vi.hoisted(() => {
  class AuthRequiredError extends Error {
    constructor(message = "You must sign in to continue.") {
      super(message);
      this.name = "AuthRequiredError";
    }
  }
  class JobUrlImportError extends Error {
    readonly code: string;

    constructor(code: string, message: string) {
      super(message);
      this.name = "JobUrlImportError";
      this.code = code;
    }
  }
  return {
    AuthRequiredError,
    JobUrlImportError,
    requireUser: vi.fn(),
    getDataRepository: vi.fn(),
    fetchJobDescription: vi.fn(),
    createImportBatch: vi.fn(),
    bulkCreateApplications: vi.fn(),
    updateImportBatch: vi.fn(),
  };
});

vi.mock("@/lib/auth", () => ({
  AuthRequiredError: mocks.AuthRequiredError,
  requireUser: mocks.requireUser,
}));
vi.mock("@/lib/data", () => ({ getDataRepository: mocks.getDataRepository }));
vi.mock("@/lib/import/url", () => ({
  JobUrlImportError: mocks.JobUrlImportError,
  fetchJobDescription: mocks.fetchJobDescription,
}));

import { POST } from "./route";

const job = {
  title: "ML Engineer",
  company: "Northstar",
  description: "Build reliable production machine-learning systems and developer tooling.",
  sourceUrl: "https://northstar.example/jobs/ml-engineer",
  location: "Berlin",
  workplaceType: "hybrid",
  employmentType: "temporary",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "owner-id" });
  mocks.getDataRepository.mockResolvedValue({
    createImportBatch: mocks.createImportBatch,
    bulkCreateApplications: mocks.bulkCreateApplications,
    updateImportBatch: mocks.updateImportBatch,
  });
  mocks.createImportBatch.mockResolvedValue({ id: "batch-id" });
  mocks.bulkCreateApplications.mockResolvedValue({
    applications: [{ id: "application-id" }],
    errors: [],
  });
});

describe("POST /api/imports/url", () => {
  it("previews a safe public URL without mutating import history", async () => {
    mocks.fetchJobDescription.mockResolvedValue({
      title: job.title,
      company: job.company,
      text: job.description,
      finalUrl: job.sourceUrl,
    });

    const response = await POST(new Request("http://localhost/api/imports/url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: job.sourceUrl, commit: false }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.fetchJobDescription).toHaveBeenCalledWith(job.sourceUrl, expect.any(Object));
    expect(mocks.getDataRepository).not.toHaveBeenCalled();
  });

  it("records a reviewed URL import and links the saved role to its batch", async () => {
    const response = await POST(new Request("http://localhost/api/imports/url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...job, commit: true }),
    }));

    expect(response.status).toBe(201);
    expect(mocks.getDataRepository).toHaveBeenCalledWith({ userId: "owner-id" });
    expect(mocks.createImportBatch).toHaveBeenCalledWith({
      source: "url",
      fileName: "URL import",
      totalRows: 1,
      status: "processing",
    });
    expect(mocks.bulkCreateApplications).toHaveBeenCalledWith([{
      job: { ...job, source: "url" },
      application: { status: "saved" },
    }], "batch-id");
    expect(await response.json()).toEqual({
      application: { id: "application-id" },
      errors: [],
    });
  });

  it("returns a failed audited import when persistence rejects the reviewed role", async () => {
    mocks.bulkCreateApplications.mockResolvedValue({
      applications: [],
      errors: [{ row: 1, message: 'duplicate key on private.jobs; password="secret"' }],
    });

    const response = await POST(new Request("http://localhost/api/imports/url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...job, commit: true }),
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Could not save the imported job.",
      errors: [{ row: 1, message: "This row could not be imported." }],
    });
    expect(mocks.updateImportBatch).toHaveBeenCalledWith("batch-id", expect.objectContaining({
      status: "failed",
      errors: [{ row: 1, message: "This row could not be imported." }],
    }));
  });

  it("maps missing authentication to 401 without exposing identity-provider details", async () => {
    mocks.requireUser.mockRejectedValue(
      new mocks.AuthRequiredError("identity provider response should remain private"),
    );

    const response = await POST(new Request("http://localhost/api/imports/url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: job.sourceUrl, commit: false }),
    }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "You must sign in to continue." });
  });

  it("returns safe 400 responses for invalid requests and URL import domain errors", async () => {
    const invalidResponse = await POST(new Request("http://localhost/api/imports/url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "file:///etc/passwd", commit: false }),
    }));
    expect(invalidResponse.status).toBe(400);
    expect(await invalidResponse.json()).toEqual({ error: "Invalid URL import request." });

    mocks.fetchJobDescription.mockRejectedValue(
      new mocks.JobUrlImportError(
        "blocked_address",
        "Job URL resolves to a non-public network",
      ),
    );
    const blockedResponse = await POST(new Request("http://localhost/api/imports/url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: job.sourceUrl, commit: false }),
    }));
    expect(blockedResponse.status).toBe(400);
    expect(await blockedResponse.json()).toEqual({
      error: "Job URL resolves to a non-public network",
    });
  });

  it("returns a generic 500 for unexpected URL fetch and backend errors", async () => {
    mocks.fetchJobDescription.mockRejectedValue(
      new Error("request failed with proxy password and private address"),
    );

    const fetchResponse = await POST(new Request("http://localhost/api/imports/url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: job.sourceUrl, commit: false }),
    }));
    expect(fetchResponse.status).toBe(500);
    expect(await fetchResponse.json()).toEqual({ error: "Could not import this URL." });

    mocks.fetchJobDescription.mockReset();
    mocks.createImportBatch.mockRejectedValue(
      new Error('relation "private.import_batches" does not exist'),
    );
    const backendResponse = await POST(new Request("http://localhost/api/imports/url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...job, commit: true }),
    }));
    expect(backendResponse.status).toBe(500);
    expect(await backendResponse.json()).toEqual({ error: "Could not import this URL." });
  });

  it("maps persistence-domain conflicts to a safe 400 response", async () => {
    mocks.createImportBatch.mockRejectedValue(
      new DataConflictError("duplicate constraint private_import_key exposed"),
    );

    const response = await POST(new Request("http://localhost/api/imports/url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...job, commit: true }),
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Could not save the imported job." });
  });
});
