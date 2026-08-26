import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthRequiredError, requireUser } from "@/lib/auth";
import { getDataRepository } from "@/lib/data";
import { createCvMarkdownResponse } from "@/lib/cv-downloads";

export const runtime = "nodejs";

export async function GET(
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
    if (!cv) return NextResponse.json({ error: "CV version not found." }, { status: 404 });

    return createCvMarkdownResponse(cv.content);
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    return NextResponse.json({ error: "Could not download this CV." }, { status: 500 });
  }
}
