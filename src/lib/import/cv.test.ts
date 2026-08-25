import { describe, expect, it } from "vitest";

import {
  CvExtractionError,
  extractCvText,
  type CvDocumentExtractor,
} from "./cv";

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
    const docx = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
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
});
