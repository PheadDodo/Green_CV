import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getDataRepository: vi.fn(),
  deleteImportBatch: vi.fn(),
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

const IMPORT_BATCH_ID = "10000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "owner-id" });
  mocks.getDataRepository.mockResolvedValue({
    deleteImportBatch: mocks.deleteImportBatch,
  });
  mocks.deleteImportBatch.mockResolvedValue(undefined);
});

describe("DELETE /api/imports/[id]", () => {
  it("deletes an owner-scoped import audit batch", async () => {
    const response = await DELETE(
      new Request(`http://localhost/api/imports/${IMPORT_BATCH_ID}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: IMPORT_BATCH_ID }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.getDataRepository).toHaveBeenCalledWith({ userId: "owner-id" });
    expect(mocks.deleteImportBatch).toHaveBeenCalledWith(IMPORT_BATCH_ID);
    expect(await response.json()).toEqual({ deleted: true });
  });

  it("treats malformed identifiers as not found", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/imports/not-an-id", { method: "DELETE" }),
      { params: Promise.resolve({ id: "not-an-id" }) },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Import batch not found." });
    expect(mocks.getDataRepository).not.toHaveBeenCalled();
    expect(mocks.deleteImportBatch).not.toHaveBeenCalled();
  });

  it("requires authentication", async () => {
    mocks.requireUser.mockRejectedValue(new AuthRequiredError());

    const response = await DELETE(
      new Request(`http://localhost/api/imports/${IMPORT_BATCH_ID}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: IMPORT_BATCH_ID }) },
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Authentication required." });
    expect(mocks.getDataRepository).not.toHaveBeenCalled();
  });

  it("does not reveal whether an import batch belongs to another owner", async () => {
    mocks.deleteImportBatch.mockRejectedValue(
      new DataNotFoundError("Import batch", IMPORT_BATCH_ID),
    );

    const response = await DELETE(
      new Request(`http://localhost/api/imports/${IMPORT_BATCH_ID}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: IMPORT_BATCH_ID }) },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Import batch not found." });
  });

  it("does not expose unexpected backend errors", async () => {
    mocks.deleteImportBatch.mockRejectedValue(new Error("private database detail"));

    const response = await DELETE(
      new Request(`http://localhost/api/imports/${IMPORT_BATCH_ID}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: IMPORT_BATCH_ID }) },
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Could not delete this import history." });
  });
});
