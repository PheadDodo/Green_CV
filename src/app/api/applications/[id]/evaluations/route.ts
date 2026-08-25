import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getDataRepository } from "@/lib/data";
import { evaluateApplication } from "@/lib/services/evaluate-application";

const schema = z.object({ force: z.boolean().optional().default(false) });
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [{ id }, user, input] = await Promise.all([params, requireUser(), request.json().catch(() => ({})).then(value => schema.parse(value))]);
    const repository = await getDataRepository({ userId: user.id });
    const result = await evaluateApplication(repository, id, { force: input.force });
    return NextResponse.json(result, { status: result.reused ? 200 : 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Evaluation failed." }, { status: 500 });
  }
}
