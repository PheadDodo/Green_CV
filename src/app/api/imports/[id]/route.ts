import { NextResponse } from "next/server";
import { z } from "zod";

import { AuthRequiredError, requireUser } from "@/lib/auth";
import { DataNotFoundError, getDataRepository } from "@/lib/data";

function deletionError(error: unknown): NextResponse {
  if (error instanceof AuthRequiredError) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (error instanceof DataNotFoundError) {
    return NextResponse.json({ error: "Import batch not found." }, { status: 404 });
  }
  return NextResponse.json({ error: "Could not delete this import history." }, { status: 500 });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const [{ id }, user] = await Promise.all([params, requireUser()]);
    if (!z.string().uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Import batch not found." }, { status: 404 });
    }
    const repository = await getDataRepository({ userId: user.id });
    await repository.deleteImportBatch(id);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return deletionError(error);
  }
}
