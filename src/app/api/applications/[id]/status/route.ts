import { NextResponse } from "next/server";
import { z } from "zod";

import { AuthRequiredError, requireUser } from "@/lib/auth";
import {
  DataConflictError,
  DataNotFoundError,
  getDataRepository,
} from "@/lib/data";
import { APPLICATION_STATUSES } from "@/lib/data/types";

const identifier = z.string().uuid();
const schema = z.object({
  status: z.enum(APPLICATION_STATUSES),
  notes: z.string().max(2_000).optional(),
}).strict();

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!identifier.safeParse(id).success) {
      return NextResponse.json({ error: "Application not found." }, { status: 404 });
    }
    const user = await requireUser();
    const parsed = schema.safeParse(await request.json().catch(() => undefined));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid application status update." }, { status: 400 });
    }

    const repository = await getDataRepository({ userId: user.id });
    const application = await repository.updateApplicationStatus(
      id,
      parsed.data.status,
      parsed.data.notes,
    );
    return NextResponse.json({ application });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    if (error instanceof DataNotFoundError) {
      return NextResponse.json({ error: "Application not found." }, { status: 404 });
    }
    if (error instanceof DataConflictError) {
      return NextResponse.json(
        { error: "This application status transition is not allowed." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "Could not update application status." },
      { status: 500 },
    );
  }
}
