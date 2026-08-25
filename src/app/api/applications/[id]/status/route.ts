import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getDataRepository } from "@/lib/data";
import { APPLICATION_STATUSES } from "@/lib/data/types";

const schema = z.object({ status: z.enum(APPLICATION_STATUSES), notes: z.string().max(2000).optional() });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [{ id }, user, input] = await Promise.all([params, requireUser(), request.json().then(value => schema.parse(value))]);
    const repository = await getDataRepository({ userId: user.id });
    const application = await repository.updateApplicationStatus(id, input.status, input.notes);
    return NextResponse.json({ application });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update status." }, { status: 400 });
  }
}
