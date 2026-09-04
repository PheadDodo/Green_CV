import { NextResponse } from "next/server";
import { z } from "zod";

import { AuthRequiredError, requireUser } from "@/lib/auth";
import {
  DataConflictError,
  DataNotFoundError,
  getDataRepository,
} from "@/lib/data";

const identifier = z.string().uuid();

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!identifier.safeParse(id).success) {
      return NextResponse.json({ error: "Automation run not found." }, { status: 404 });
    }

    const user = await requireUser();
    const repository = await getDataRepository({ userId: user.id });
    const run = await repository.cancelAutomationRun(id);
    return NextResponse.json({ run });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    if (error instanceof DataNotFoundError) {
      return NextResponse.json({ error: "Automation run not found." }, { status: 404 });
    }
    if (error instanceof DataConflictError) {
      return NextResponse.json(
        { error: "This automation run can no longer be cancelled." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "Could not cancel automation run." },
      { status: 500 },
    );
  }
}
