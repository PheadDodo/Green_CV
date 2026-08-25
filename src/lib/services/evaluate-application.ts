import type { DataRepository } from "@/lib/data/repository";
import type { Evaluation } from "@/lib/data/types";
import { evaluateRole } from "@/lib/evaluation";

export const EVALUATION_PROMPT_VERSION = "3.0";

export async function evaluateApplication(repository: DataRepository, applicationId: string, options: { force?: boolean } = {}): Promise<{ evaluation: Evaluation; isDemo: boolean; reused: boolean }> {
  const application = await repository.getApplication(applicationId);
  if (!application) throw new Error("Application not found.");
  if (!application.cvVersionId || !application.cvVersion) throw new Error("Attach a CV version before evaluation.");
  const existing = (await repository.listEvaluations(application.jobId)).find(item => item.applicationId === application.id && item.cvVersionId === application.cvVersionId && item.promptVersion === EVALUATION_PROMPT_VERSION && item.status === "completed");
  if (existing && !options.force) return { evaluation: existing, isDemo: existing.model === "deterministic-demo-evaluator", reused: true };

  const pending = await repository.createEvaluation({ applicationId: application.id, jobId: application.jobId, cvVersionId: application.cvVersionId, status: "running", promptVersion: EVALUATION_PROMPT_VERSION });
  try {
    const output = await evaluateRole({ jobTitle: application.job.title, company: application.job.company, jobDescription: application.job.description, cvName: application.cvVersion.name, cvContent: application.cvVersion.content });
    const result = output.result;
    const evaluation = await repository.updateEvaluation(pending.id, {
      status: "completed", recommendation: result.recommendation, overallScore: result.overallScore,
      summary: result.summary,
      strengths: [...result.strongMatches, ...result.partialMatches].map(match => match.requirement),
      gaps: result.gaps.map(gap => `${gap.requirement}: ${gap.explanation}`),
      evidence: [...result.strongMatches, ...result.partialMatches].map(match => ({ requirement: match.requirement, cvEvidence: match.evidence, score: match.confidence === "strong" ? 90 : 65 })),
      suggestedEdits: result.suggestedEdits.map(edit => `${edit.section}: ${edit.suggestion}`),
      model: output.model, promptVersion: EVALUATION_PROMPT_VERSION, completedAt: new Date().toISOString()
    });
    await repository.createApplicationEvent({ applicationId: application.id, type: "evaluation_completed", title: `Evaluation completed · ${result.overallScore}/100`, details: output.isDemo ? "Deterministic demo evaluator" : `Model: ${output.model}`, metadata: { evaluationId: evaluation.id } });
    return { evaluation, isDemo: output.isDemo, reused: false };
  } catch (error) {
    await repository.updateEvaluation(pending.id, { status: "failed", errorMessage: error instanceof Error ? error.message : "Evaluation failed." });
    throw error;
  }
}
