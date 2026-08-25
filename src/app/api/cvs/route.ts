import { NextResponse } from "next/server";
import mammoth from "mammoth";
import pdf from "pdf-parse/lib/pdf-parse.js";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getDataRepository } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
const MAX_BYTES = 5 * 1024 * 1024;
const manualSchema = z.object({ name: z.string().trim().min(2).max(120), content: z.string().trim().min(30).max(250_000), summary: z.string().trim().max(500).optional() });

function skillsFrom(content: string) {
  const known = ["Python","SQL","PyTorch","TensorFlow","NLP","MLOps","Docker","Kubernetes","AWS","GCP","Azure","React","TypeScript","Statistics","Experimentation"];
  return known.filter(skill => new RegExp(`\\b${skill.replace(/[+#]/g, "\\$&")}\\b`, "i").test(content));
}

async function extract(file: File, buffer: Buffer) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (file.type === "application/pdf" || extension === "pdf") return (await pdf(buffer)).text;
  if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || extension === "docx") return (await mammoth.extractRawText({ buffer })).value;
  if (["txt","md"].includes(extension ?? "") || file.type.startsWith("text/")) return buffer.toString("utf8");
  throw new Error("Unsupported CV type. Use PDF, DOCX, Markdown, or plain text.");
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const repository = await getDataRepository({ userId: user.id });
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const input = manualSchema.parse(await request.json());
      const cv = await repository.createCvVersion({ ...input, skills: skillsFrom(input.content), mimeType: "text/plain" });
      return NextResponse.json({ cv }, { status: 201 });
    }

    const data = await request.formData();
    const file = data.get("file");
    const name = z.string().trim().min(2).max(120).parse(data.get("name"));
    const summary = z.string().trim().max(500).catch("").parse(data.get("summary"));
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a CV file." }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "CV files must be 5 MB or smaller." }, { status: 413 });
    const buffer = Buffer.from(await file.arrayBuffer());
    const content = (await extract(file, buffer)).replace(/\0/g, "").trim();
    if (content.length < 30) return NextResponse.json({ error: "The file did not contain enough extractable text. Paste its text manually instead." }, { status: 422 });
    let storagePath: string | null = null;
    if (isSupabaseConfigured()) {
      storagePath = `${user.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const client = await createClient();
      const { error } = await client.storage.from("cv-files").upload(storagePath, buffer, { contentType: file.type || "application/octet-stream", upsert: false });
      if (error) throw error;
    }
    const cv = await repository.createCvVersion({ name, summary: summary || null, content, fileName: file.name, mimeType: file.type || null, storagePath, skills: skillsFrom(content) });
    return NextResponse.json({ cv }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create CV version." }, { status: 400 });
  }
}
