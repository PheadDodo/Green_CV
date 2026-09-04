import { beforeEach, describe, expect, it, vi } from "vitest";

import { DataConflictError } from "@/lib/data/repository";

const mocks = vi.hoisted(() => {
  class AuthRequiredError extends Error {
    constructor(message = "You must sign in to continue.") {
      super(message);
      this.name = "AuthRequiredError";
    }
  }
  return {
    AuthRequiredError,
    requireUser: vi.fn(),
    getDataRepository: vi.fn(),
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

import { POST } from "./route";

const job = {
  title: "ML Engineer",
  company: "Northstar",
  description: "Build reliable production machine-learning systems and developer tooling.",
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

describe("POST /api/imports/csv", () => {
  it("commits reviewed rows with the original CSV filename", async () => {
    const response = await POST(new Request("http://localhost/api/imports/csv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobs: [job],
        jobRows: [2],
        previewErrors: [],
        totalRows: 1,
        fileName: "my-search-history.csv",
        commit: true,
      }),
    }));

    expect(response.status).toBe(201);
    expect(mocks.createImportBatch).toHaveBeenCalledWith({
      source: "csv",
      fileName: "my-search-history.csv",
      totalRows: 1,
      status: "processing",
    });
    expect(mocks.bulkCreateApplications).toHaveBeenCalledWith([{
      job: { ...job, source: "csv" },
      application: { status: "saved" },
    }], "batch-id");
    expect(await response.json()).toEqual({
      applications: [{ id: "application-id" }],
      errors: [],
      failedRows: 0,
      succeededRows: 1,
      totalRows: 1,
    });
    expect(mocks.updateImportBatch).not.toHaveBeenCalled();
  });

  it("returns the original CSV row for every reviewed job", async () => {
    const csv = [
      "",
      "title,company,description",
      "ML Engineer,Northstar,Build production systems",
      "",
      "Data Scientist,,Analyze product data",
      "Platform Engineer,Acme,Build reliable platforms",
    ].join("\n");

    const response = await POST(new Request("http://localhost/api/imports/csv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv, fileName: "mixed.csv", commit: false }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      totalRows: 3,
      jobRows: [3, 6],
      errors: [expect.objectContaining({ row: 5, message: "Company is required" })],
    });
  });

  it("persists preview and write failures against their original CSV rows", async () => {
    const secondJob = {
      title: "Platform Engineer",
      company: "Acme",
      description: "Build and operate reliable developer platforms.",
    };
    mocks.bulkCreateApplications.mockResolvedValue({
      applications: [{ id: "application-id" }],
      errors: [{ row: 2, message: "This csv job has already been imported." }],
    });

    const response = await POST(new Request("http://localhost/api/imports/csv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobs: [job, secondJob],
        jobRows: [2, 4],
        previewErrors: [
          { row: 3, message: "Company is required" },
          { row: 3, message: "Unknown workplace type" },
        ],
        totalRows: 3,
        fileName: "mixed.csv",
        commit: true,
      }),
    }));

    const combinedErrors = [
      { row: 3, message: "Company is required" },
      { row: 3, message: "Unknown workplace type" },
      { row: 4, message: "This row could not be imported." },
    ];
    expect(response.status).toBe(201);
    expect(mocks.createImportBatch).toHaveBeenCalledWith({
      source: "csv",
      fileName: "mixed.csv",
      totalRows: 3,
      status: "processing",
    });
    expect(mocks.updateImportBatch).toHaveBeenCalledWith("batch-id", {
      status: "partial",
      totalRows: 3,
      processedRows: 3,
      succeededRows: 1,
      failedRows: 2,
      errors: combinedErrors,
      completedAt: expect.any(String),
    });
    expect(await response.json()).toEqual({
      applications: [{ id: "application-id" }],
      errors: combinedErrors,
      failedRows: 2,
      succeededRows: 1,
      totalRows: 3,
    });
  });

  it("rejects more than 100 synchronous rows before creating a batch", async () => {
    const response = await POST(new Request("http://localhost/api/imports/csv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobs: Array.from({ length: 101 }, () => job),
        fileName: "too-large.csv",
        commit: true,
      }),
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "CSV imports are limited to 100 rows per request.",
    });
    expect(mocks.getDataRepository).not.toHaveBeenCalled();
    expect(mocks.createImportBatch).not.toHaveBeenCalled();
  });

  it("applies the same 100-row limit while previewing CSV text", async () => {
    const rows = Array.from({ length: 101 }, (_, index) =>
      `Role ${index},Northstar,Description long enough for import row ${index}`,
    );
    const csv = ["title,company,description", ...rows].join("\n");

    const response = await POST(new Request("http://localhost/api/imports/csv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv, fileName: "too-large.csv", commit: false }),
    }));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("100-row limit");
    expect(mocks.getDataRepository).not.toHaveBeenCalled();
  });

  it("rejects a tampered reviewed row with a non-HTTP source URL", async () => {
    const response = await POST(new Request("http://localhost/api/imports/csv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobs: [{ ...job, sourceUrl: "javascript:alert(document.cookie)" }],
        jobRows: [2],
        previewErrors: [],
        totalRows: 1,
        fileName: "tampered.csv",
        commit: true,
      }),
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid CSV import request." });
    expect(mocks.getDataRepository).not.toHaveBeenCalled();
  });

  it("accepts the complete parser job shape without dropping reviewed fields", async () => {
    const reviewedJob = {
      ...job,
      location: "Berlin",
      workplaceType: "hybrid",
      employmentType: "temporary",
      sourceUrl: "https://jobs.example/roles/42?source=board",
      externalId: "role-42",
      salaryMin: 80_000.5,
      salaryMax: 120_000,
      salaryCurrency: "EUR",
      publishedAt: "2026-08-01T00:00:00.000Z",
    };

    const response = await POST(new Request("http://localhost/api/imports/csv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobs: [reviewedJob],
        jobRows: [2],
        previewErrors: [],
        totalRows: 1,
        commit: true,
      }),
    }));

    expect(response.status).toBe(201);
    expect(mocks.bulkCreateApplications).toHaveBeenCalledWith([{
      job: { ...reviewedJob, source: "csv" },
      application: { status: "saved" },
    }], "batch-id");
  });

  it.each([
    ["unknown fields", { unexpected: "not produced by the parser" }],
    ["oversized titles", { title: "x".repeat(301) }],
    ["oversized locations", { location: "x".repeat(501) }],
    ["negative salaries", { salaryMin: -1 }],
    ["reversed salary ranges", { salaryMin: 200, salaryMax: 100 }],
    ["non-parser currency codes", { salaryCurrency: "usd" }],
    ["non-canonical published dates", { publishedAt: "2026-08-01" }],
  ])("rejects %s in a tampered commit", async (_label, mutation) => {
    const response = await POST(new Request("http://localhost/api/imports/csv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobs: [{ ...job, ...mutation }],
        jobRows: [2],
        previewErrors: [],
        totalRows: 1,
        commit: true,
      }),
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid CSV import request." });
    expect(mocks.getDataRepository).not.toHaveBeenCalled();
  });

  it("maps missing authentication to 401 without exposing the thrown message", async () => {
    mocks.requireUser.mockRejectedValue(
      new mocks.AuthRequiredError("identity provider response should remain private"),
    );

    const response = await POST(new Request("http://localhost/api/imports/csv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv: "title,company,description", commit: false }),
    }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "You must sign in to continue." });
    expect(mocks.getDataRepository).not.toHaveBeenCalled();
  });

  it("returns a generic 500 for unexpected backend failures", async () => {
    mocks.createImportBatch.mockRejectedValue(
      new Error('relation "private.jobs" does not exist; password=database-secret'),
    );

    const response = await POST(new Request("http://localhost/api/imports/csv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobs: [job],
        jobRows: [2],
        previewErrors: [],
        totalRows: 1,
        commit: true,
      }),
    }));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "CSV import failed." });
  });

  it("maps persistence-domain conflicts to a safe 400 response", async () => {
    mocks.createImportBatch.mockRejectedValue(
      new DataConflictError("duplicate constraint private_import_key exposed"),
    );

    const response = await POST(new Request("http://localhost/api/imports/csv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobs: [job],
        jobRows: [2],
        previewErrors: [],
        totalRows: 1,
        commit: true,
      }),
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "CSV import could not be completed.",
    });
  });

  it("replaces row-level persistence internals with a safe import error", async () => {
    mocks.bulkCreateApplications.mockResolvedValue({
      applications: [],
      errors: [{ row: 1, message: 'duplicate key on private.jobs using password "secret"' }],
    });

    const response = await POST(new Request("http://localhost/api/imports/csv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobs: [job],
        jobRows: [7],
        previewErrors: [],
        totalRows: 1,
        commit: true,
      }),
    }));

    const safeErrors = [{ row: 7, message: "This row could not be imported." }];
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      applications: [],
      errors: safeErrors,
      failedRows: 1,
      succeededRows: 0,
      totalRows: 1,
    });
    expect(mocks.updateImportBatch).toHaveBeenCalledWith("batch-id", expect.objectContaining({
      status: "failed",
      errors: safeErrors,
    }));
  });
});
