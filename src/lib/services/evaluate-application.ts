import type { DataRepository } from "@/lib/data/repository";
import { ZodError } from "zod";
import type { Evaluation } from "@/lib/data/types";
import { evaluateRole } from "@/lib/evaluation";
import {
  countPaidEvaluationsToday,
  EvaluationQuotaError,
  getDailyEvaluationLimit,
} from "@/lib/evaluation-quota";
import { LlmSettingsConfigurationError, LlmSettingsValidationError, resolveLlmConfig } from "@/lib/llm/settings";
import { usesLlmConfiguration } from "@/lib/llm/evaluation-config";
import { LlmHttpError } from "@/lib/llm/http";
import { LlmProviderResponseError } from "@/lib/llm/providers";
import type { ResolvedLlmConfig } from "@/lib/llm/types";

export const EVALUATION_PROMPT_VERSION = "3.0";
const PUBLIC_EVALUATION_FAILURE = "Evaluation could not be completed. Try again later.";

export class EvaluationExecutionError extends Error {
  constructor(message = PUBLIC_EVALUATION_FAILURE) {
    super(message);
    this.name = "EvaluationExecutionError";
  }
}

export async function evaluateApplication(repository: DataRepository, applicationId: string, options: { force?: boolean } = {}): Promise<{ evaluation: Evaluation; isDemo: boolean; reused: boolean }> {
  const application = await repository.getApplication(applicationId);
  if (!application) throw new Error("Application not found.");
  if (!application.cvVersionId || !application.cvVersion) throw new Error("Attach a CV version before evaluation.");

  let config: ResolvedLlmConfig;
  try {
    config = await resolveLlmConfig(repository);
  } catch (error) {
    const message = error instanceof LlmSettingsValidationError || error instanceof LlmSettingsConfigurationError
      ? error.message : PUBLIC_EVALUATION_FAILURE;
    throw new EvaluationExecutionError(message);
  }
  const existing = (await repository.listEvaluations(application.jobId)).find(item =>
    item.applicationId === application.id &&
    item.cvVersionId === application.cvVersionId &&
    item.promptVersion === EVALUATION_PROMPT_VERSION &&
    item.status === "completed" &&
    usesLlmConfiguration(item, config),
  );
  if (existing && !options.force) return {
    evaluation: existing,
    isDemo: config.mode === "demo",
    reused: true,
  };

  const pending = await repository.createEvaluation({
    applicationId: application.id,
    jobId: application.jobId,
    cvVersionId: application.cvVersionId,
    status: "running",
    promptVersion: EVALUATION_PROMPT_VERSION,
    model: config.model,
    providerMode: config.mode,
    providerFingerprint: config.fingerprint,
  });
  try {
    if (config.mode === "api") {
      const limit = getDailyEvaluationLimit();
      // Reserve first, then count committed API reservations. Local and demo
      // attempts do not spend the owner's paid-provider allowance.
      const attemptsToday = countPaidEvaluationsToday(await repository.listEvaluations());
      if (attemptsToday > limit) throw new EvaluationQuotaError(limit);
    }

    const output = await evaluateRole({ jobTitle: application.job.title, company: application.job.company, jobDescription: application.job.description, cvName: application.cvVersion.name, cvContent: application.cvVersion.content }, config);
    const result = output.result;
    const evaluation = await repository.updateEvaluation(pending.id, {
      status: "completed", recommendation: result.recommendation, overallScore: result.overallScore,
      summary: result.summary,
      strengths: [...result.strongMatches, ...result.partialMatches].map(match => match.requirement),
      gaps: result.gaps.map(gap => `${gap.requirement}: ${gap.explanation}`),
      evidence: [...result.strongMatches, ...result.partialMatches].map(match => ({ requirement: match.requirement, cvEvidence: match.evidence, score: match.confidence === "strong" ? 90 : 65 })),
      suggestedEdits: result.suggestedEdits.map(edit => `${edit.section}: ${edit.suggestion}`),
      model: output.model, promptVersion: EVALUATION_PROMPT_VERSION, completedAt: new Date().toISOString(),
      providerMode: config.mode, providerFingerprint: config.fingerprint,
    });
    await repository.createApplicationEvent({
      applicationId: application.id,
      type: "evaluation_completed",
      title: `Evaluation completed · ${result.overallScore}/100`,
      details: output.isDemo ? "Deterministic demo evaluator" : `Model: ${output.model}`,
      metadata: { evaluationId: evaluation.id, providerMode: config.mode },
    });
    return { evaluation, isDemo: output.isDemo, reused: false };
  } catch (error) {
    let publicMessage = error instanceof EvaluationQuotaError ? error.message : PUBLIC_EVALUATION_FAILURE;
    if (config.mode !== "demo" && config.protocol !== "openai-responses") {
      if (error instanceof LlmHttpError || error instanceof LlmProviderResponseError) publicMessage = error.message;
      else if (error instanceof ZodError) publicMessage = "The selected LLM returned data that does not match the evaluation format.";
    }
    await repository.updateEvaluation(pending.id, { status: "failed", errorMessage: publicMessage });
    if (error instanceof EvaluationQuotaError) throw error;
    throw new EvaluationExecutionError(publicMessage);
  }
}
