import { NextResponse } from "next/server";
import mammoth from "mammoth";
import { z } from "zod";
import { AuthRequiredError, requireUser } from "@/lib/auth";
import { canonicalizeCvMarkdown } from "@/lib/cv-artifacts";
import {
  createCvStoragePath,
  removeLocalCvFile,
  saveLocalCvFile,
} from "@/lib/cv-file-store";
import { getDataRepository } from "@/lib/data";
import { CvExtractionError, extractCvText } from "@/lib/import/cv";
import { extractPdfText } from "@/lib/import/pdf";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
// Leave room for multipart overhead under Vercel's 4.5 MB request limit.
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_CHARACTERS = 250_000;
const manualSchema = z.object({ name: z.string().trim().min(2).max(120), content: z.string().trim().min(30).max(MAX_CHARACTERS), summary: z.string().trim().max(500).optional() });

function skillsFrom(content: string) {
  const known = ["Python","SQL","PyTorch","TensorFlow","NLP","MLOps","Docker","Kubernetes","AWS","GCP","Azure","React","TypeScript","Statistics","Experimentation"];
  return known.filter(skill => new RegExp(`\\b${skill.replace(/[+#]/g, "\\$&")}\\b`, "i").test(content));
}

function uploadError(error: unknown): NextResponse {
  if (error instanceof AuthRequiredError) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: "Check the CV name and text limits." }, { status: 400 });
  }
  if (error instanceof CvExtractionError) {
    const status = error.code === "file_too_large" ? 413 : error.code === "unsupported_type" || error.code === "type_mismatch" ? 400 : 422;
    const messages: Partial<Record<CvExtractionError["code"], string>> = {
      unsupported_type: "Unsupported CV type. Use PDF, DOCX, Markdown, or plain text.",
      type_mismatch: "The CV filename does not match its file type.",
      empty_file: "The CV file is empty.",
      file_too_large: "CV files must be 4 MB or smaller.",
      invalid_text_encoding: "The text CV must use UTF-8 encoding.",
      invalid_document: "The CV file is not a valid PDF or DOCX document.",
      extraction_failed: "The CV text could not be extracted.",
      empty_extraction: "The file did not contain readable text. Paste its text manually instead.",
      extracted_text_too_large: "The extracted CV text is too large.",
    };
    return NextResponse.json({ error: messages[error.code] ?? "The CV could not be processed." }, { status });
  }
  return NextResponse.json({ error: "Could not create CV version." }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const repository = await getDataRepository({ userId: user.id });
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const input = manualSchema.parse(await request.json());
      const content = canonicalizeCvMarkdown(input.content);
      await repository.createCvVersion({ ...input, content, skills: skillsFrom(content), mimeType: "text/markdown" });
      return NextResponse.json({ created: true }, { status: 201 });
    }

    const data = await request.formData();
    const file = data.get("file");
    const name = z.string().trim().min(2).max(120).parse(data.get("name"));
    const summary = z.string().trim().max(500).catch("").parse(data.get("summary"));
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a CV file." }, { status: 400 });
    if (file.name.length > 180) return NextResponse.json({ error: "The CV filename is too long." }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "CV files must be 4 MB or smaller." }, { status: 413 });
    const buffer = Buffer.from(await file.arrayBuffer());
    const extracted = await extractCvText(
      { fileName: file.name, mimeType: file.type, data: buffer },
      {
        maxBytes: MAX_BYTES,
        maxCharacters: MAX_CHARACTERS,
        extractors: {
          pdf: async ({ bytes }) => extractPdfText(bytes),
          docx: async ({ bytes }) => (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value,
        },
      },
    );
    const content = canonicalizeCvMarkdown(extracted.text);
    if (content.length < 30) return NextResponse.json({ error: "The file did not contain enough extractable text. Paste its text manually instead." }, { status: 422 });
    let storagePath: string | null = null;
    let storageClient: Awaited<ReturnType<typeof createClient>> | null = null;
    if (isSupabaseConfigured()) {
      storagePath = createCvStoragePath(user.id, extracted.format);
      storageClient = await createClient();
      const { error } = await storageClient.storage.from("cv-files").upload(storagePath, buffer, { contentType: extracted.mimeType, upsert: false });
      if (error) throw error;
    } else {
      storagePath = await saveLocalCvFile({
        userId: user.id,
        extension: extracted.format,
        bytes: buffer,
      });
    }
    try {
      await repository.createCvVersion({ name, summary: summary || null, content, fileName: file.name, mimeType: extracted.mimeType, storagePath, skills: skillsFrom(content) });
    } catch (error) {
      if (storageClient && storagePath) {
        await storageClient.storage.from("cv-files").remove([storagePath]);
      } else if (storagePath) {
        await removeLocalCvFile(storagePath);
      }
      throw error;
    }
    return NextResponse.json({ created: true }, { status: 201 });
  } catch (error) {
    return uploadError(error);
  }
}
