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

function positionedWordsPdf(): ArrayBuffer {
  // Non-private fixture whose words are separate PDF text items on shared baselines.
  const encoded = Buffer.from(
    "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",
    "base64",
  );
  const bytes = new ArrayBuffer(encoded.byteLength);
  new Uint8Array(bytes).set(encoded);
  return bytes;
}

function fictionalDocx(): ArrayBuffer {
  // Minimal DOCX containing only fictional CV paragraphs, including split text
  // runs and XML-escaped characters. No Office metadata or personal document.
  const encoded = "UEsDBAoAAAAIAAAAIVD3VP4j2QAAAGQBAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbJWQu1LDMBBFf0WjlrHWUDAMYzsFjxIowgfsyGtbg16jVUL4e9YJSZGOUrpn75G22xyCV3sq7FLs9a1ptaJo0+ji3OvP7WvzoDdDt/3JxErQyL1eas2PAGwXCsgmZYqSTKkErHIsM2S0XzgT3LXtPdgUK8Xa1LVDD90zTbjzVb0c5PqkLeRZq6cTuLp6jTl7Z7FKDvs4XlmaP4ORySPDi8t8I4CGoXuX/xQ3kvrAUt8wSB18pzLCmOwuiMKs4L98aZqcpcv82pZLssQsiwreXJKALp7fAce1Db9QSwMECgAAAAgAAAAhUDZX3tyiAAAAGAEAAAsAAABfcmVscy8ucmVsc43POw7CMAwG4KtE3qkLA0KoaReE1BWVA0SJm0Y0DyXhdXsyMFDEwGj792e56R52ZjeKyXjHYV3VwMhJr4zTHM7DcbWDrm1ONItcEmkyIbGy4hKHKeewR0xyIitS5QO5Mhl9tCKXMmoMQl6EJtzU9RbjpwFLk/WKQ+zVGtjwDPSP7cfRSDp4ebXk8o8TX4kii6gpc7j7qFC921VhAdsGFy+2L1BLAwQKAAAACAAAACFQf5+XJPsAAADJAQAAEQAAAHdvcmQvZG9jdW1lbnQueG1shZFbS8QwEIX/ypCHvtlUH0R6W3SpsFh03Sr4mm3HNpAbSXa7++9NBBVF6MsZJnPyTTgpVycp4IjWca0qcplmBFD1euBqrMjry/3FDVnV5ZwPuj9IVB6CX7l8rsjkvckpdf2EkrlUG1Rh9q6tZD60dqSztoOxukfnAk4KepVl11QyrkhE7vVwjtVEsVF8fSvwBM2JSSOwpPEkqv1U89e8fto10D1s2rZb9G7PftIKkkAuoHtuIRG+GJhnyegL8FoLt8ho3rbNbtM8rpsla0wpd4b1WBFj0aE9IqnvDlx4+HX3m21RcLYXCPFNYLgJvUKX/rOJfkVHf76l/gBQSwECFAAKAAAACAAAACFQ91T+I9kAAABkAQAAEwAAAAAAAAAAAAAAAAAAAAAAW0NvbnRlbnRfVHlwZXNdLnhtbFBLAQIUAAoAAAAIAAAAIVA2V97cogAAABgBAAALAAAAAAAAAAAAAAAAAAoBAABfcmVscy8ucmVsc1BLAQIUAAoAAAAIAAAAIVB/n5ck+wAAAMkBAAARAAAAAAAAAAAAAAAAANUBAAB3b3JkL2RvY3VtZW50LnhtbFBLBQYAAAAAAwADALkAAAD/AgAAAAA=";
  return Uint8Array.from(Buffer.from(encoded, "base64")).buffer;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "demo-user" });
  mocks.getDataRepository.mockResolvedValue({ createCvVersion: mocks.createCvVersion });
  mocks.saveLocalCvFile.mockResolvedValue("demo-user/artifact-id/original.txt");
  mocks.createCvVersion.mockImplementation(async (input) => ({ id: "cv-id", ...input }));
});

describe("POST /api/cvs", () => {
  it("preserves headings, split runs, and escaped characters in a real DOCX import", async () => {
    mocks.saveLocalCvFile.mockResolvedValue("demo-user/artifact-id/original.docx");
    const form = new FormData();
    form.set("name", "Fictional DOCX CV");
    form.set("file", new File([fictionalDocx()], "fictional-cv.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }));

    const response = await POST(new Request("http://localhost/api/cvs", {
      method: "POST",
      body: form,
    }));

    expect({ status: response.status, body: await response.json() }).toEqual({
      status: 201,
      body: { created: true },
    });
    expect(mocks.createCvVersion).toHaveBeenCalledWith(expect.objectContaining({
      name: "Fictional DOCX CV",
      content: "Alex Example\n\n## Core Skills\n\nPython & SQL <data> tools\n\n## Experience\n\nBuilt reliable data pipelines.",
      fileName: "fictional-cv.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      storagePath: "demo-user/artifact-id/original.docx",
    }));
  });

  it("preserves visual spaces between separately positioned PDF words", async () => {
    const form = new FormData();
    form.set("name", "Data Science CV");
    form.set("file", new File([positionedWordsPdf()], "resume.pdf", { type: "application/pdf" }));

    const response = await POST(new Request("http://localhost/api/cvs", {
      method: "POST",
      body: form,
    }));

    expect({ status: response.status, body: await response.clone().json() }).toEqual({
      status: 201,
      body: { created: true },
    });
    expect(mocks.createCvVersion).toHaveBeenCalledWith(expect.objectContaining({
      content: "## Professional Summary\nRecent data scientist\n## Core Skills",
    }));
  });

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
      content: expect.stringContaining("## Professional Experience"),
      mimeType: "text/markdown",
    }));
    expect(mocks.saveLocalCvFile).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({ created: true });
  });
});
