import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getDataRepository: vi.fn(),
  createCvVersion: vi.fn(),
  saveLocalCvFile: vi.fn(),
  removeLocalCvFile: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  AuthRequiredError: class AuthRequiredError extends Error {},
  requireUser: mocks.requireUser,
}));
vi.mock("@/lib/data", () => ({ getDataRepository: mocks.getDataRepository }));
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => false }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/cv-file-store", () => ({
  createCvStoragePath: vi.fn(),
  saveLocalCvFile: mocks.saveLocalCvFile,
  removeLocalCvFile: mocks.removeLocalCvFile,
}));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "demo-user" });
  mocks.getDataRepository.mockResolvedValue({ createCvVersion: mocks.createCvVersion });
  mocks.saveLocalCvFile.mockResolvedValue("demo-user/artifact-id/original.txt");
  mocks.createCvVersion.mockImplementation(async (input) => ({ id: "cv-id", ...input }));
});

describe("POST /api/cvs", () => {
  it("validates, canonicalizes, and privately stores an uploaded CV", async () => {
    const form = new FormData();
    form.set("name", "Backend CV");
    form.set("summary", "Backend roles");
    form.set("file", new File([
      `Alex Morgan\nalex@example.com | +49 30 123456\n\nEXPERIENCE\n• Built Python services\n\nEDUCATION\nMSc Computer Science\n\nSKILLS\nPython, SQL`,
    ], "alex.txt", { type: "text/plain" }));

    const response = await POST(new Request("http://localhost/api/cvs", {
      method: "POST",
      body: form,
    }));

    expect(response.status).toBe(201);
    expect(mocks.saveLocalCvFile).toHaveBeenCalledWith(expect.objectContaining({
      userId: "demo-user",
      extension: "txt",
    }));
    expect(mocks.createCvVersion).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining("## Experience"),
      mimeType: "text/plain",
      storagePath: "demo-user/artifact-id/original.txt",
    }));
  });

  it("stores pasted CV text as canonical Markdown", async () => {
    const response = await POST(new Request("http://localhost/api/cvs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Pasted CV",
        content: "Alex Morgan\n\nPROFESSIONAL EXPERIENCE\n• Built reliable Python services for customers.",
      }),
    }));

    expect(response.status).toBe(201);
    expect(mocks.createCvVersion).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining("## Experience"),
      mimeType: "text/markdown",
    }));
    expect(mocks.saveLocalCvFile).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({ created: true });
  });
});
