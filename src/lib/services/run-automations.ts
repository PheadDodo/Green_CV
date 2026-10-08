import { createAutomationIdempotencyKey } from "@/lib/automation/idempotency";
import { usesLlmConfiguration } from "@/lib/llm/evaluation-config";
import { resolveLlmConfig } from "@/lib/llm/settings";
import type { ResolvedLlmConfig } from "@/lib/llm/types";
import { createAutomationEngine } from "@/lib/automation/engine";
import { createAutoEvaluationRule, createFollowUpReminderRule, createInterviewPrepRule } from "@/lib/automation/rules";
import type {
  AutomationIntent,
  AutomationRule as EngineRule,
  EvaluationAutomationIntent,
  ReminderAutomationIntent,
} from "@/lib/automation/types";
import { DataConflictError, type DataRepository } from "@/lib/data/repository";
import {
  MAX_AUTOMATION_RUN_ATTEMPTS,
  REMINDER_AUTOMATION_RUN_LEASE_MS,
  type ApplicationRecord,
  type AutomationRule as StoredRule,
  type AutomationRun,
} from "@/lib/data/types";
import { evaluateApplication } from "./evaluate-application";

const typeByEngineId = {
  "auto-evaluation": "auto_evaluate",
  "follow-up-reminder": "follow_up",
  "interview-prep": "interview_prep"
} as const;

function numberConfig(rule: StoredRule, name: string, fallback: number) {
  const value = rule.config[name];
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function engineRules(rules: StoredRule[]): EngineRule[] {
  return rules.filter(rule => rule.enabled).map(rule => {
    if (rule.type === "follow_up") return createFollowUpReminderRule(numberConfig(rule, "delayHours", numberConfig(rule, "delayDays", 7) * 24) * 3_600_000);
    if (rule.type === "interview_prep") return createInterviewPrepRule(numberConfig(rule, "leadHours", 24) * 3_600_000);
    return createAutoEvaluationRule(numberConfig(rule, "minimumDescriptionLength", 40));
  });
}

function lastEventAt(application: ApplicationRecord, types: string[]) {
  return application.events.filter(event => types.includes(event.type)).map(event => event.occurredAt).sort().at(-1) ?? null;
}

function interviewAt(application: ApplicationRecord) {
  return application.events.flatMap(event => typeof event.metadata.interviewAt === "string" ? [event.metadata.interviewAt] : []).sort().at(-1) ?? null;
}

function nextRetry(attempts: number) {
  return new Date(Date.now() + Math.min(15 * 60_000, 30_000 * 2 ** Math.max(0, attempts - 1))).toISOString();
}

function shouldSkipReminderRun(run: AutomationRun) {
  if (run.status === "succeeded" || run.status === "cancelled") {
    return true;
  }
  if (run.status === "running") {
    if (run.attempts >= MAX_AUTOMATION_RUN_ATTEMPTS) return true;
    const startedAt = Date.parse(run.startedAt ?? "");
    return Number.isFinite(startedAt)
      && startedAt > Date.now() - REMINDER_AUTOMATION_RUN_LEASE_MS;
  }
  return run.status === "failed" && (
    run.attempts >= MAX_AUTOMATION_RUN_ATTEMPTS
    || new Date(run.scheduledAt).getTime() > Date.now()
  );
}

async function executeEvaluationIntent(
  repository: DataRepository,
  rules: StoredRule[],
  intent: EvaluationAutomationIntent,
) {
  const type = typeByEngineId[intent.ruleId as keyof typeof typeByEngineId];
  const rule = rules.find(item => item.type === type) ?? null;
  let run = await repository.getAutomationRunByIdempotencyKey(intent.idempotencyKey);
  if (run?.status === "succeeded" || run?.status === "cancelled" || run?.status === "running") return { status: "skipped" as const, run };
  if (run?.status === "failed" && (run.attempts >= 4 || new Date(run.scheduledAt).getTime() > Date.now())) return { status: "skipped" as const, run };
  if (!run) run = await repository.createAutomationRun({ ruleId: rule?.id, applicationId: intent.applicationId, type, idempotencyKey: intent.idempotencyKey, status: "pending", scheduledAt: intent.availableAt });
  run = await repository.updateAutomationRun(run.id, { status: "running", attempts: run.attempts + 1, startedAt: new Date().toISOString(), errorMessage: null });
  try {
    await evaluateApplication(repository, intent.applicationId);
    run = await repository.updateAutomationRun(run.id, { status: "succeeded", completedAt: new Date().toISOString() });
    return { status: "succeeded" as const, run };
  } catch (error) {
    run = await repository.updateAutomationRun(run.id, { status: "failed", errorMessage: error instanceof Error ? error.message : "Automation failed.", scheduledAt: nextRetry(run.attempts), completedAt: new Date().toISOString() });
    return { status: "failed" as const, run };
  }
}

async function createOrReloadReminderRun(
  repository: DataRepository,
  rules: StoredRule[],
  intent: ReminderAutomationIntent,
) {
  const existing = await repository.getAutomationRunByIdempotencyKey(intent.idempotencyKey);
  if (existing) return existing;

  const type = typeByEngineId[intent.ruleId as keyof typeof typeByEngineId];
  const rule = rules.find(item => item.type === type) ?? null;
  try {
    return await repository.createAutomationRun({
      ruleId: rule?.id,
      applicationId: intent.applicationId,
      type,
      idempotencyKey: intent.idempotencyKey,
      status: "pending",
      scheduledAt: intent.availableAt,
    });
  } catch (error) {
    if (!(error instanceof DataConflictError)) throw error;
    const winner = await repository.getAutomationRunByIdempotencyKey(intent.idempotencyKey);
    if (!winner) throw error;
    return winner;
  }
}

async function executeReminderIntent(
  repository: DataRepository,
  rules: StoredRule[],
  intent: ReminderAutomationIntent,
) {
  let run = await createOrReloadReminderRun(repository, rules, intent);
  if (shouldSkipReminderRun(run)) return { status: "skipped" as const, run };

  const claimed = await repository.claimAutomationRun(run.id, {
    expectedAttempts: run.attempts,
    startedAt: new Date().toISOString(),
  });
  if (!claimed) {
    run = (await repository.getAutomationRun(run.id)) ?? run;
    return { status: "skipped" as const, run };
  }

  run = claimed;
  try {
    await repository.ensureAutomationReminder(run.id, {
      applicationId: intent.applicationId,
      title: intent.payload.title,
      notes: intent.payload.notes,
      dueAt: intent.payload.dueAt,
    });
    run = await repository.updateAutomationRun(run.id, {
      status: "succeeded",
      completedAt: new Date().toISOString(),
    });
    return { status: "succeeded" as const, run };
  } catch (error) {
    run = await repository.updateAutomationRun(run.id, {
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Automation failed.",
      scheduledAt: nextRetry(run.attempts),
      completedAt: new Date().toISOString(),
    });
    return { status: "failed" as const, run };
  }
}

function executeIntent(
  repository: DataRepository,
  rules: StoredRule[],
  intent: AutomationIntent,
) {
  return intent.action === "reminder.create"
    ? executeReminderIntent(repository, rules, intent)
    : executeEvaluationIntent(repository, rules, intent);
}

export async function runAutomations(repository: DataRepository, userId: string) {
  const [rules, applications] = await Promise.all([repository.listAutomationRules(), repository.listApplications()]);
  const configuredRules = engineRules(rules);
  if (!configuredRules.length) return { evaluated: applications.length, intents: 0, succeeded: 0, failed: 0, skipped: 0 };
  let evaluationConfig: ResolvedLlmConfig | null = null;
  if (rules.some(rule => rule.enabled && rule.type === "auto_evaluate")) {
    try {
      evaluationConfig = await resolveLlmConfig(repository);
    } catch {
      // Let evaluation execution record a safe failed run; reminders remain usable.
    }
  }
  const engine = createAutomationEngine({ rules: configuredRules });
  const evaluationsByJob = new Map<string, Awaited<ReturnType<DataRepository["listEvaluations"]>>>();
  for (const jobId of new Set(applications.map(application => application.jobId))) evaluationsByJob.set(jobId, await repository.listEvaluations(jobId));
  const intents = applications.flatMap(application => engine.evaluate({
    userId,
    application: { id: application.id, jobId: application.jobId, status: application.status, cvVersionId: application.cvVersionId, appliedAt: application.appliedAt, lastEmployerContactAt: lastEventAt(application, ["follow_up"]) },
    job: { id: application.job.id, title: application.job.title, company: application.job.company, description: application.job.description, updatedAt: application.job.updatedAt },
    interviewAt: interviewAt(application),
    evaluations: (evaluationsByJob.get(application.jobId) ?? []).filter(value => value.applicationId === application.id && evaluationConfig !== null && usesLlmConfiguration(value, evaluationConfig)).map(value => ({ status: value.status, cvVersionId: value.cvVersionId, jobUpdatedAt: undefined }))
  }).intents.map(intent => intent.action === "evaluation.request" ? {
    ...intent,
    idempotencyKey: createAutomationIdempotencyKey(intent.ruleId, {
      intentKey: intent.idempotencyKey,
      providerFingerprint: evaluationConfig?.fingerprint ?? "unavailable-provider-settings",
    }),
  } : intent));
  const results = [];
  for (const intent of intents) results.push(await executeIntent(repository, rules, intent));
  return { evaluated: applications.length, intents: intents.length, succeeded: results.filter(item => item.status === "succeeded").length, failed: results.filter(item => item.status === "failed").length, skipped: results.filter(item => item.status === "skipped").length };
}
