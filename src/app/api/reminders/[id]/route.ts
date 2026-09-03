import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthRequiredError, requireUser } from "@/lib/auth";
import { DataNotFoundError, getDataRepository } from "@/lib/data";

export const runtime = "nodejs";

const reminderUpdateSchema = z.object({
  status: z.enum(["completed", "dismissed"]),
}).strict();

function mutationError(error: unknown): NextResponse {
  if (error instanceof AuthRequiredError) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (error instanceof DataNotFoundError) {
    return NextResponse.json({ error: "Reminder not found." }, { status: 404 });
  }
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return NextResponse.json({ error: "Invalid reminder update." }, { status: 400 });
  }
  return NextResponse.json({ error: "Could not update this reminder." }, { status: 500 });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const [{ id }, user, input] = await Promise.all([
      params,
      requireUser(),
      request.json().then((value) => reminderUpdateSchema.parse(value)),
    ]);
    if (!z.string().uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Reminder not found." }, { status: 404 });
    }

    const repository = await getDataRepository({ userId: user.id });
    if (input.status === "completed") {
      await repository.completeReminder(id);
    } else {
      await repository.dismissReminder(id);
    }
    return NextResponse.json({ updated: true, status: input.status });
  } catch (error) {
    return mutationError(error);
  }
}
