import { NextResponse } from "next/server";
import { z } from "zod";

import { AuthRequiredError, requireUser } from "@/lib/auth";
import {
  DataConflictError,
  DataNotFoundError,
  getDataRepository,
} from "@/lib/data";

const identity = {
  id: z.string().uuid().optional(),
  enabled: z.boolean(),
};

const schema = z.discriminatedUnion("type", [
  z.object({
    ...identity,
    type: z.literal("auto_evaluate"),
  }).strict(),
  z.object({
    ...identity,
    type: z.literal("follow_up"),
    config: z.object({
      delayHours: z.number().int().min(1).max(720),
    }).strict().optional(),
  }).strict(),
  z.object({
    ...identity,
    type: z.literal("interview_prep"),
    config: z.object({
      leadHours: z.number().int().min(1).max(168),
    }).strict().optional(),
  }).strict(),
]);

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(await request.json().catch(() => undefined));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid automation rule settings." },
        { status: 400 },
      );
    }

    const repository = await getDataRepository({ userId: user.id });
    const rule = await repository.upsertAutomationRule(parsed.data);
    return NextResponse.json({ rule });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    if (error instanceof DataNotFoundError) {
      return NextResponse.json({ error: "Automation rule not found." }, { status: 404 });
    }
    if (error instanceof DataConflictError) {
      return NextResponse.json(
        { error: "Automation rule conflicts with existing settings." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "Could not update automation rule." },
      { status: 500 },
    );
  }
}
