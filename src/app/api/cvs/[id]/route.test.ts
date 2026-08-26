import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getDataRepository: vi.fn(),
  updateCvVersion: vi.fn(),
  getCvVersion: vi.fn(),
  deleteCvVersion: vi.fn(),
  removeLocalCvFile: vi.fn(),
  isSupabaseConfigured: vi.fn(),
  createClient: vi.fn(),
  storageFrom: vi.fn(),
  storageRemove: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  AuthRequiredError: class AuthRequiredError extends Error {},
  requireUser: mocks.requireUser,
}));
vi.mock("@/lib/data", () => ({
  DataNotFoundError: class DataNotFoundError extends Error {},
  getDataRepository: mocks.getDataRepository,
}));
vi.mock("@/lib/cv-file-store", () => ({ removeLocalCvFile: mocks.removeLocalCvFile }));
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: mocks.isSupabaseConfigured }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { DELETE, PATCH } from "./route";

const CV_ID = "10000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "owner-id" });
  mocks.getDataRepository.mockResolvedValue({
    updateCvVersion: mocks.updateCvVersion,
    getCvVersion: mocks.getCvVersion,
    deleteCvVersion: mocks.deleteCvVersion,
  });
  mocks.updateCvVersion.mockResolvedValue({ id: CV_ID, isDefault: true });
  mocks.getCvVersion.mockResolvedValue({
    id: CV_ID,
    storagePath: "owner-id/artifact-id/original.pdf",
  });
  mocks.removeLocalCvFile.mockResolvedValue(undefined);
  mocks.deleteCvVersion.mockResolvedValue(undefined);
  mocks.isSupabaseConfigured.mockReturnValue(false);
  mocks.storageRemove.mockResolvedValue({ error: null });
  mocks.storageFrom.mockReturnValue({ remove: mocks.storageRemove });
  mocks.createClient.mockResolvedValue({ storage: { from: mocks.storageFrom } });
});

describe("PATCH /api/cvs/[id]", () => {
  it("selects an owner-scoped CV as the default", async () => {
    const response = await PATCH(new Request("http://localhost/api/cvs/id", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    }), { params: Promise.resolve({ id: CV_ID }) });

    expect(response.status).toBe(200);
    expect(mocks.getDataRepository).toHaveBeenCalledWith({ userId: "owner-id" });
    expect(mocks.updateCvVersion).toHaveBeenCalledWith(CV_ID, { isDefault: true });
    expect(await response.json()).toEqual({ selected: true });
  });
});

describe("DELETE /api/cvs/[id]", () => {
  it("removes an owned local artifact before deleting its CV record", async () => {
    const response = await DELETE(new Request("http://localhost/api/cvs/id", {
      method: "DELETE",
    }), { params: Promise.resolve({ id: CV_ID }) });

    expect(response.status).toBe(200);
    expect(mocks.getDataRepository).toHaveBeenCalledWith({ userId: "owner-id" });
    expect(mocks.removeLocalCvFile).toHaveBeenCalledWith("owner-id/artifact-id/original.pdf");
    expect(mocks.deleteCvVersion).toHaveBeenCalledWith(CV_ID);
    expect(mocks.removeLocalCvFile.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.deleteCvVersion.mock.invocationCallOrder[0]);
    expect(await response.json()).toEqual({ deleted: true });
  });

  it("keeps the CV record when artifact removal fails", async () => {
    mocks.removeLocalCvFile.mockRejectedValue(new Error("storage unavailable"));

    const response = await DELETE(new Request("http://localhost/api/cvs/id", {
      method: "DELETE",
    }), { params: Promise.resolve({ id: CV_ID }) });

    expect(response.status).toBe(500);
    expect(mocks.deleteCvVersion).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({ error: "Could not delete this CV." });
  });

  it("uses request-scoped private storage in Supabase mode", async () => {
    mocks.isSupabaseConfigured.mockReturnValue(true);

    const response = await DELETE(new Request("http://localhost/api/cvs/id", {
      method: "DELETE",
    }), { params: Promise.resolve({ id: CV_ID }) });

    expect(response.status).toBe(200);
    expect(mocks.createClient).toHaveBeenCalledOnce();
    expect(mocks.storageFrom).toHaveBeenCalledWith("cv-files");
    expect(mocks.storageRemove).toHaveBeenCalledWith(["owner-id/artifact-id/original.pdf"]);
    expect(mocks.removeLocalCvFile).not.toHaveBeenCalled();
    expect(mocks.storageRemove.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.deleteCvVersion.mock.invocationCallOrder[0]);
  });

  it("keeps the CV record when Supabase storage rejects removal", async () => {
    mocks.isSupabaseConfigured.mockReturnValue(true);
    mocks.storageRemove.mockResolvedValue({ error: new Error("storage unavailable") });

    const response = await DELETE(new Request("http://localhost/api/cvs/id", {
      method: "DELETE",
    }), { params: Promise.resolve({ id: CV_ID }) });

    expect(response.status).toBe(500);
    expect(mocks.deleteCvVersion).not.toHaveBeenCalled();
  });

  it("rejects a stored artifact path outside the authenticated owner prefix", async () => {
    mocks.getCvVersion.mockResolvedValue({
      id: CV_ID,
      storagePath: "another-owner/artifact-id/original.pdf",
    });

    const response = await DELETE(new Request("http://localhost/api/cvs/id", {
      method: "DELETE",
    }), { params: Promise.resolve({ id: CV_ID }) });

    expect(response.status).toBe(404);
    expect(mocks.removeLocalCvFile).not.toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.deleteCvVersion).not.toHaveBeenCalled();
  });

  it("does not touch storage when the owner-scoped CV lookup misses", async () => {
    mocks.getCvVersion.mockResolvedValue(null);

    const response = await DELETE(new Request("http://localhost/api/cvs/id", {
      method: "DELETE",
    }), { params: Promise.resolve({ id: CV_ID }) });

    expect(response.status).toBe(404);
    expect(mocks.removeLocalCvFile).not.toHaveBeenCalled();
    expect(mocks.deleteCvVersion).not.toHaveBeenCalled();
  });

  it("deletes a pasted CV without calling artifact storage", async () => {
    mocks.getCvVersion.mockResolvedValue({ id: CV_ID, storagePath: null });

    const response = await DELETE(new Request("http://localhost/api/cvs/id", {
      method: "DELETE",
    }), { params: Promise.resolve({ id: CV_ID }) });

    expect(response.status).toBe(200);
    expect(mocks.removeLocalCvFile).not.toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.deleteCvVersion).toHaveBeenCalledWith(CV_ID);
  });

  it("reports a partial deletion when the artifact is gone but the record remains", async () => {
    mocks.deleteCvVersion.mockRejectedValue(new Error("database unavailable"));

    const response = await DELETE(new Request("http://localhost/api/cvs/id", {
      method: "DELETE",
    }), { params: Promise.resolve({ id: CV_ID }) });

    expect(response.status).toBe(500);
    expect(mocks.removeLocalCvFile).toHaveBeenCalledOnce();
    expect(await response.json()).toEqual({
      error: "The original file was removed, but the CV record remains. Retry deletion.",
      code: "partial_delete",
    });
  });
});
