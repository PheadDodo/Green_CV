import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getDataRepository: vi.fn(),
  getCvVersion: vi.fn(),
  readLocalCvFile: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  AuthRequiredError: class AuthRequiredError extends Error {},
  requireUser: mocks.requireUser,
}));
vi.mock("@/lib/data", () => ({ getDataRepository: mocks.getDataRepository }));
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => false }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/cv-file-store", () => ({ readLocalCvFile: mocks.readLocalCvFile }));

import { GET } from "./route";

const CV_ID = "10000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "owner-id" });
  mocks.getDataRepository.mockResolvedValue({ getCvVersion: mocks.getCvVersion });
});

describe("GET /api/cvs/[id]/pdf", () => {
  it("reads the server-side artifact path after an owner-scoped lookup", async () => {
    const bytes = Buffer.from("%PDF-");
    mocks.getCvVersion.mockResolvedValue({
      mimeType: "application/pdf",
      storagePath: "owner-id/artifact-id/original.pdf",
    });
    mocks.readLocalCvFile.mockResolvedValue(bytes);

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: CV_ID }),
    });

    expect(mocks.getDataRepository).toHaveBeenCalledWith({ userId: "owner-id" });
    expect(mocks.readLocalCvFile).toHaveBeenCalledWith("owner-id/artifact-id/original.pdf");
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
  });

  it("does not read storage for an absent or non-PDF CV", async () => {
    mocks.getCvVersion.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: CV_ID }),
    });

    expect(response.status).toBe(404);
    expect(mocks.readLocalCvFile).not.toHaveBeenCalled();
  });

  it("rejects an artifact path outside the authenticated owner's prefix", async () => {
    mocks.getCvVersion.mockResolvedValue({
      mimeType: "application/pdf",
      storagePath: "different-owner/artifact-id/original.pdf",
    });

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: CV_ID }),
    });

    expect(response.status).toBe(404);
    expect(mocks.readLocalCvFile).not.toHaveBeenCalled();
  });
});
