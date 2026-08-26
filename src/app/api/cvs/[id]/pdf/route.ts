import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthRequiredError, requireUser } from "@/lib/auth";
import { readLocalCvFile } from "@/lib/cv-file-store";
import { createCvPdfResponse } from "@/lib/cv-downloads";
import { getDataRepository } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function notFound() {
  return NextResponse.json({ error: "CV PDF not found." }, { status: 404 });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const [{ id }, user] = await Promise.all([params, requireUser()]);
    if (!z.string().uuid().safeParse(id).success) return notFound();

    const repository = await getDataRepository({ userId: user.id });
    const cv = await repository.getCvVersion(id);
    if (
      !cv
      || cv.mimeType !== "application/pdf"
      || !cv.storagePath
      || !cv.storagePath.startsWith(`${user.id}/`)
    ) return notFound();

    let bytes: Uint8Array;
    if (isSupabaseConfigured()) {
      const client = await createClient();
      const { data, error } = await client.storage.from("cv-files").download(cv.storagePath);
      if (error || !data) return notFound();
      bytes = new Uint8Array(await data.arrayBuffer());
    } else {
      bytes = new Uint8Array(await readLocalCvFile(cv.storagePath));
    }

    return createCvPdfResponse(bytes);
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    return notFound();
  }
}
