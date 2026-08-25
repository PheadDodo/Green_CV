import type { Evaluation } from "./data/types";

export class EvaluationQuotaError extends Error {
  constructor(readonly limit: number) {
    super(`Daily evaluation limit reached (${limit}). Try again tomorrow or raise MAX_EVALUATIONS_PER_DAY.`);
    this.name = "EvaluationQuotaError";
  }
}

export function getDailyEvaluationLimit(): number {
  const configured = process.env.MAX_EVALUATIONS_PER_DAY?.trim();
  if (!configured) return 20;
  if (!/^\d+$/.test(configured)) {
    throw new Error("MAX_EVALUATIONS_PER_DAY must be a whole number between 0 and 1000.");
  }
  const limit = Number(configured);
  if (!Number.isSafeInteger(limit) || limit > 1000) {
    throw new Error("MAX_EVALUATIONS_PER_DAY must be a whole number between 0 and 1000.");
  }
  return limit;
}

export function countEvaluationsToday(
  evaluations: Evaluation[],
  now = new Date(),
): number {
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return evaluations.filter((evaluation) => {
    const createdAt = Date.parse(evaluation.createdAt);
    return Number.isFinite(createdAt) && createdAt >= start && createdAt <= now.getTime();
  }).length;
}
