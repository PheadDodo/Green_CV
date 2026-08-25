import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getDataRepository } from "@/lib/data";
import { AUTOMATION_RULE_TYPES } from "@/lib/data/types";

const schema = z.object({ id: z.string().uuid().optional(), type: z.enum(AUTOMATION_RULE_TYPES), enabled: z.boolean(), config: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional() });

export async function PATCH(request: Request) {
  try {
    const [user, input] = await Promise.all([requireUser(), request.json().then(value => schema.parse(value))]);
    const repository = await getDataRepository({ userId: user.id });
    return NextResponse.json({ rule: await repository.upsertAutomationRule(input) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update rule." }, { status: 400 });
  }
}
