export type CvFormat = "txt" | "md" | "pdf" | "docx";

export type CvExtractionErrorCode =
  | "unsupported_type"
  | "type_mismatch"
  | "empty_file"
  | "file_too_large"
  | "invalid_text_encoding"
  | "invalid_document"
  | "extractor_unavailable"
  | "extraction_failed"
  | "empty_extraction"
  | "extracted_text_too_large";

export class CvExtractionError extends Error {
  readonly code: CvExtractionErrorCode;
  readonly format?: CvFormat;
  readonly fileName?: string;

  constructor(
    code: CvExtractionErrorCode,
    message: string,
    details: { format?: CvFormat; fileName?: string; cause?: unknown } = {},
  ) {
    super(message, details.cause === undefined ? undefined : { cause: details.cause });
    this.name = "CvExtractionError";
    this.code = code;
    this.format = details.format;
    this.fileName = details.fileName;
  }
}

export interface CvFileInput {
  fileName: string;
  mimeType?: string | null;
  data: string | ArrayBuffer | Uint8Array;
}

export interface CvDocumentExtractorInput {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
  format: "pdf" | "docx";
}

/** Adapter point for server-only packages such as pdf-parse or mammoth. */
export type CvDocumentExtractor = (input: CvDocumentExtractorInput) => Promise<string>;

export interface CvDocumentExtractors {
  pdf?: CvDocumentExtractor;
  docx?: CvDocumentExtractor;
}

export interface CvExtractionOptions {
  extractors?: CvDocumentExtractors;
  maxBytes?: number;
  maxCharacters?: number;
}

export interface ExtractedCvText {
  fileName: string;
  format: CvFormat;
  mimeType: string;
  text: string;
  bytes: number;
}

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_CHARACTERS = 2_000_000;

const FORMAT_MIME: Readonly<Record<CvFormat, string>> = {
  txt: "text/plain",
  md: "text/markdown",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const MIME_FORMAT: Readonly<Record<string, CvFormat>> = {
  "text/plain": "txt",
  "text/markdown": "md",
  "text/x-markdown": "md",
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

const EXTENSION_FORMAT: Readonly<Record<string, CvFormat>> = {
  txt: "txt",
  text: "txt",
  md: "md",
  markdown: "md",
  pdf: "pdf",
  docx: "docx",
};

function unavailableExtractor(format: "pdf" | "docx", packageName: string): CvDocumentExtractor {
  return async ({ fileName }) => {
    throw new CvExtractionError(
      "extractor_unavailable",
      `${format.toUpperCase()} extraction requires a configured ${packageName} adapter`,
      { format, fileName },
    );
  };
}

/** Placeholder that makes the missing optional PDF package explicit at runtime. */
export const PDF_EXTRACTOR_PLACEHOLDER = unavailableExtractor("pdf", "PDF parser");

/** Placeholder that makes the missing optional DOCX package explicit at runtime. */
export const DOCX_EXTRACTOR_PLACEHOLDER = unavailableExtractor("docx", "DOCX parser");

function safeInteger(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError("CV limits must be positive safe integers");
  return value;
}

function normalizedMimeType(mimeType: string | null | undefined): string | null {
  const normalized = mimeType?.split(";", 1)[0].trim().toLowerCase();
  return normalized && normalized !== "application/octet-stream" ? normalized : null;
}

function extensionOf(fileName: string): string | null {
  const match = /\.([^.]+)$/.exec(fileName.trim());
  return match ? match[1].toLowerCase() : null;
}

function detectFormat(file: CvFileInput): { format: CvFormat; mimeType: string } {
  const mime = normalizedMimeType(file.mimeType);
  const fromMime = mime ? MIME_FORMAT[mime] : undefined;
  const extension = extensionOf(file.fileName);
  const fromExtension = extension ? EXTENSION_FORMAT[extension] : undefined;

  if (mime && !fromMime) {
    throw new CvExtractionError("unsupported_type", `Unsupported CV MIME type: ${mime}`, {
      fileName: file.fileName,
    });
  }
  if (fromMime && fromExtension && fromMime !== fromExtension) {
    throw new CvExtractionError(
      "type_mismatch",
      "CV file extension does not match its MIME type",
      { format: fromExtension, fileName: file.fileName },
    );
  }
  const format = fromMime ?? fromExtension;
  if (!format) {
    throw new CvExtractionError("unsupported_type", "CV must be TXT, Markdown, PDF, or DOCX", {
      fileName: file.fileName,
    });
  }
  return { format, mimeType: FORMAT_MIME[format] };
}

function toBytes(data: CvFileInput["data"]): Uint8Array {
  if (typeof data === "string") return new TextEncoder().encode(data);
  if (data instanceof Uint8Array) return data.slice();
  return new Uint8Array(data.slice(0));
}

function assertDocumentSignature(format: CvFormat, bytes: Uint8Array, fileName: string): void {
  if (format === "pdf") {
    const signature = new TextDecoder("ascii").decode(bytes.slice(0, 5));
    if (signature !== "%PDF-") {
      throw new CvExtractionError("invalid_document", "PDF signature is missing", { format, fileName });
    }
  }
  if (format === "docx") {
    const isZip =
      bytes[0] === 0x50 &&
      bytes[1] === 0x4b &&
      ((bytes[2] === 0x03 && bytes[3] === 0x04) ||
        (bytes[2] === 0x05 && bytes[3] === 0x06) ||
        (bytes[2] === 0x07 && bytes[3] === 0x08));
    if (!isZip) {
      throw new CvExtractionError("invalid_document", "DOCX ZIP signature is missing", { format, fileName });
    }
  }
}

function normalizeText(text: string): string {
  return text
    .replace(/^\ufeff/, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[\t ]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function validateExtractedText(
  raw: string,
  maxCharacters: number,
  format: CvFormat,
  fileName: string,
): string {
  const text = normalizeText(raw);
  if (!text) {
    throw new CvExtractionError("empty_extraction", "CV contains no readable text", { format, fileName });
  }
  if (text.length > maxCharacters) {
    throw new CvExtractionError(
      "extracted_text_too_large",
      "Extracted CV text exceeds the configured character limit",
      { format, fileName },
    );
  }
  return text;
}

/**
 * Extracts normalized CV text. TXT/Markdown are handled directly; PDF/DOCX are
 * intentionally delegated to injected server-side package adapters.
 */
export async function extractCvText(
  file: CvFileInput,
  options: CvExtractionOptions = {},
): Promise<ExtractedCvText> {
  const maxBytes = safeInteger(options.maxBytes, DEFAULT_MAX_BYTES);
  const maxCharacters = safeInteger(options.maxCharacters, DEFAULT_MAX_CHARACTERS);
  const { format, mimeType } = detectFormat(file);
  const bytes = toBytes(file.data);
  if (bytes.byteLength === 0) {
    throw new CvExtractionError("empty_file", "CV file is empty", { format, fileName: file.fileName });
  }
  if (bytes.byteLength > maxBytes) {
    throw new CvExtractionError("file_too_large", "CV file exceeds the configured byte limit", {
      format,
      fileName: file.fileName,
    });
  }
  assertDocumentSignature(format, bytes, file.fileName);

  let rawText: string;
  if (format === "txt" || format === "md") {
    try {
      rawText = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch (cause) {
      throw new CvExtractionError("invalid_text_encoding", "Text CV must be valid UTF-8", {
        format,
        fileName: file.fileName,
        cause,
      });
    }
    if (rawText.includes("\0")) {
      throw new CvExtractionError("invalid_text_encoding", "Text CV contains binary data", {
        format,
        fileName: file.fileName,
      });
    }
  } else {
    const extractor = options.extractors?.[format] ??
      (format === "pdf" ? PDF_EXTRACTOR_PLACEHOLDER : DOCX_EXTRACTOR_PLACEHOLDER);
    try {
      rawText = await extractor({ bytes, fileName: file.fileName, mimeType, format });
    } catch (cause) {
      if (cause instanceof CvExtractionError) throw cause;
      throw new CvExtractionError("extraction_failed", `Could not extract text from ${format.toUpperCase()}`, {
        format,
        fileName: file.fileName,
        cause,
      });
    }
    if (typeof rawText !== "string") {
      throw new CvExtractionError("extraction_failed", "CV extractor returned a non-text result", {
        format,
        fileName: file.fileName,
      });
    }
  }

  return {
    fileName: file.fileName,
    format,
    mimeType,
    text: validateExtractedText(rawText, maxCharacters, format, file.fileName),
    bytes: bytes.byteLength,
  };
}
