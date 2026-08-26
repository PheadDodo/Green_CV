import { describe, expect, it, vi } from "vitest";

import {
  CvExtractionError,
  extractCvText,
  type CvDocumentExtractor,
} from "./cv";

function fakeDocxArchive(uncompressedSize = 128): Uint8Array {
  const fileName = new TextEncoder().encode("word/document.xml");
  const local = new Uint8Array(30 + fileName.length + 1);
  const localView = new DataView(local.buffer);
  localView.setUint32(0, 0x04034b50, true);
  localView.setUint16(4, 20, true);
  localView.setUint16(8, 8, true);
  localView.setUint32(18, 1, true);
  localView.setUint32(22, uncompressedSize, true);
  localView.setUint16(26, fileName.length, true);
  local.set(fileName, 30);

  const central = new Uint8Array(46 + fileName.length);
  const centralView = new DataView(central.buffer);
  centralView.setUint32(0, 0x02014b50, true);
  centralView.setUint16(4, 20, true);
  centralView.setUint16(6, 20, true);
  centralView.setUint16(10, 8, true);
  centralView.setUint32(20, 1, true);
  centralView.setUint32(24, uncompressedSize, true);
  centralView.setUint16(28, fileName.length, true);
  central.set(fileName, 46);

  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(8, 1, true);
  eocdView.setUint16(10, 1, true);
  eocdView.setUint32(12, central.length, true);
  eocdView.setUint32(16, local.length, true);

  const archive = new Uint8Array(local.length + central.length + eocd.length);
  archive.set(local, 0);
  archive.set(central, local.length);
  archive.set(eocd, local.length + central.length);
  return archive;
}

describe("extractCvText", () => {
  it("extracts UTF-8 TXT and Markdown directly and normalizes line endings", async () => {
    await expect(
      extractCvText({
        fileName: "resume.txt",
        mimeType: "text/plain; charset=utf-8",
        data: new TextEncoder().encode("\ufeffML Engineer\r\n\r\nBuilt models.  \r\n"),
      }),
    ).resolves.toEqual({
      fileName: "resume.txt",
      format: "txt",
      mimeType: "text/plain",
      text: "ML Engineer\n\nBuilt models.",
      bytes: 35,
    });

    await expect(
      extractCvText({ fileName: "resume.md", data: "# ML Engineer\r\n\r\nPython" }),
    ).resolves.toMatchObject({ format: "md", text: "# ML Engineer\n\nPython" });
  });

  it("requires explicit PDF/DOCX extractors and exposes typed integration hooks", async () => {
    const pdf = new TextEncoder().encode("%PDF-1.7 fake fixture");
    await expect(
      extractCvText({ fileName: "resume.pdf", mimeType: "application/pdf", data: pdf }),
    ).rejects.toMatchObject({ code: "extractor_unavailable", format: "pdf" });

    const extractor: CvDocumentExtractor = async ({ bytes, fileName }) =>
      `${fileName}\r\nExtracted ${bytes.byteLength} bytes`;
    await expect(
      extractCvText(
        { fileName: "resume.pdf", mimeType: "application/pdf", data: pdf },
        { extractors: { pdf: extractor } },
      ),
    ).resolves.toMatchObject({
      format: "pdf",
      text: "resume.pdf\nExtracted 21 bytes",
    });
  });

  it("rejects unsafe or ambiguous input with typed errors", async () => {
    await expect(
      extractCvText({ fileName: "resume.txt", data: new Uint8Array([0xff, 0xfe]) }),
    ).rejects.toMatchObject({ code: "invalid_text_encoding" });

    await expect(
      extractCvText({ fileName: "resume.pdf", mimeType: "text/plain", data: "%PDF-1.7" }),
    ).rejects.toMatchObject({ code: "type_mismatch" });

    await expect(
      extractCvText({ fileName: "resume.exe", data: "not a cv" }),
    ).rejects.toBeInstanceOf(CvExtractionError);
  });

  it("wraps package failures and rejects empty extraction results", async () => {
    const docx = fakeDocxArchive();
    await expect(
      extractCvText(
        { fileName: "resume.docx", data: docx },
        { extractors: { docx: async () => "   \r\n" } },
      ),
    ).rejects.toMatchObject({ code: "empty_extraction", format: "docx" });

    const packageError = new Error("password protected");
    await expect(
      extractCvText(
        { fileName: "resume.docx", data: docx },
        {
          extractors: {
            docx: async () => {
              throw packageError;
            },
          },
        },
      ),
    ).rejects.toMatchObject({ code: "extraction_failed", cause: packageError });
  });

  it("rejects a DOCX whose declared expanded size exceeds the safety limit", async () => {
    const extractor = vi.fn(async () => "should not run");

    await expect(
      extractCvText(
        { fileName: "oversized.docx", data: fakeDocxArchive(40 * 1024 * 1024) },
        { extractors: { docx: extractor } },
      ),
    ).rejects.toMatchObject({ code: "invalid_document", format: "docx" });
    expect(extractor).not.toHaveBeenCalled();
  });
});
