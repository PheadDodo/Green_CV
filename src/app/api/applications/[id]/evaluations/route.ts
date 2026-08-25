import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getDataRepository } from "@/lib/data";
import { EvaluationQuotaError } from "@/lib/evaluation-quota";
import {
  evaluateApplication,
  EvaluationExecutionError,
} from "@/lib/services/evaluate-application";

const schema = z.object({ force: z.boolean().optional().default(false) });
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [{ id }, user, input] = await Promise.all([params, requireUser(), request.json().catch(() => ({})).then(value => schema.parse(value))]);
    const repository = await getDataRepository({ userId: user.id });
    const result = await evaluateApplication(repository, id, { force: input.force });
    return NextResponse.json(result, { status: result.reused ? 200 : 201 });
  } catch (error) {
    if (error instanceof EvaluationQuotaError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    if (error instanceof EvaluationExecutionError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    if (error instanceof Error && error.message === "Application not found.") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof Error && error.message === "Attach a CV version before evaluation.") {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    return NextResponse.json({ error: "Evaluation failed." }, { status: 500 });
  }
}
