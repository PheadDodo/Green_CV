import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthRequiredError, requireUser } from "@/lib/auth";
import { removeLocalCvFile } from "@/lib/cv-file-store";
import { DataNotFoundError, getDataRepository } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const selectSchema = z.object({ isDefault: z.literal(true) }).strict();

function mutationError(error: unknown, fallback = "Could not update this CV."): NextResponse {
  if (error instanceof AuthRequiredError) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (error instanceof DataNotFoundError) {
    return NextResponse.json({ error: "CV version not found." }, { status: 404 });
  }
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return NextResponse.json({ error: "Invalid CV selection." }, { status: 400 });
  }
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const [{ id }, user, input] = await Promise.all([
      params,
      requireUser(),
      request.json().then((value) => selectSchema.parse(value)),
    ]);
    if (!z.string().uuid().safeParse(id).success) {
      return NextResponse.json({ error: "CV version not found." }, { status: 404 });
    }

    const repository = await getDataRepository({ userId: user.id });
    await repository.updateCvVersion(id, { isDefault: input.isDefault });
    return NextResponse.json({ selected: true });
  } catch (error) {
    return mutationError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const [{ id }, user] = await Promise.all([params, requireUser()]);
    if (!z.string().uuid().safeParse(id).success) {
      return NextResponse.json({ error: "CV version not found." }, { status: 404 });
    }

    const repository = await getDataRepository({ userId: user.id });
    const cv = await repository.getCvVersion(id);
    if (!cv) {
      return NextResponse.json({ error: "CV version not found." }, { status: 404 });
    }

    if (cv.storagePath) {
      if (!cv.storagePath.startsWith(`${user.id}/`)) {
        return NextResponse.json({ error: "CV version not found." }, { status: 404 });
      }
      if (isSupabaseConfigured()) {
        const client = await createClient();
        const { error } = await client.storage.from("cv-files").remove([cv.storagePath]);
        if (error) throw error;
      } else {
        await removeLocalCvFile(cv.storagePath);
      }
    }

    try {
      await repository.deleteCvVersion(id);
    } catch (error) {
      if (cv.storagePath) {
        return NextResponse.json({
          error: "The original file was removed, but the CV record remains. Retry deletion.",
          code: "partial_delete",
        }, { status: 500 });
      }
      throw error;
    }
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return mutationError(error, "Could not delete this CV.");
  }
}
