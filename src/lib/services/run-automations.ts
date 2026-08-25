import { createAutomationEngine } from "@/lib/automation/engine";
import { createAutoEvaluationRule, createFollowUpReminderRule, createInterviewPrepRule } from "@/lib/automation/rules";
import type { AutomationIntent, AutomationRule as EngineRule } from "@/lib/automation/types";
import type { DataRepository } from "@/lib/data/repository";
import type { ApplicationRecord, AutomationRule as StoredRule } from "@/lib/data/types";
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

async function executeIntent(repository: DataRepository, rules: StoredRule[], intent: AutomationIntent) {
  const type = typeByEngineId[intent.ruleId as keyof typeof typeByEngineId];
  const rule = rules.find(item => item.type === type) ?? null;
  let run = await repository.getAutomationRunByIdempotencyKey(intent.idempotencyKey);
  if (run?.status === "succeeded" || run?.status === "cancelled" || run?.status === "running") return { status: "skipped" as const, run };
  if (run?.status === "failed" && (run.attempts >= 4 || new Date(run.scheduledAt).getTime() > Date.now())) return { status: "skipped" as const, run };
  if (!run) run = await repository.createAutomationRun({ ruleId: rule?.id, applicationId: intent.applicationId, type, idempotencyKey: intent.idempotencyKey, status: "pending", scheduledAt: intent.availableAt });
  run = await repository.updateAutomationRun(run.id, { status: "running", attempts: run.attempts + 1, startedAt: new Date().toISOString(), errorMessage: null });
  try {
    if (intent.action === "reminder.create") {
      await repository.upsertReminder({ applicationId: intent.applicationId, title: intent.payload.title, notes: intent.payload.notes, dueAt: intent.payload.dueAt });
    } else {
      await evaluateApplication(repository, intent.applicationId);
    }
    run = await repository.updateAutomationRun(run.id, { status: "succeeded", completedAt: new Date().toISOString() });
    return { status: "succeeded" as const, run };
  } catch (error) {
    run = await repository.updateAutomationRun(run.id, { status: "failed", errorMessage: error instanceof Error ? error.message : "Automation failed.", scheduledAt: nextRetry(run.attempts), completedAt: new Date().toISOString() });
    return { status: "failed" as const, run };
  }
}

export async function runAutomations(repository: DataRepository, userId: string) {
  const [rules, applications] = await Promise.all([repository.listAutomationRules(), repository.listApplications()]);
  const configuredRules = engineRules(rules);
  if (!configuredRules.length) return { evaluated: applications.length, intents: 0, succeeded: 0, failed: 0, skipped: 0 };
  const engine = createAutomationEngine({ rules: configuredRules });
  const evaluationsByJob = new Map<string, Awaited<ReturnType<DataRepository["listEvaluations"]>>>();
  for (const jobId of new Set(applications.map(application => application.jobId))) evaluationsByJob.set(jobId, await repository.listEvaluations(jobId));
  const intents = applications.flatMap(application => engine.evaluate({
    userId,
    application: { id: application.id, jobId: application.jobId, status: application.status, cvVersionId: application.cvVersionId, appliedAt: application.appliedAt, lastEmployerContactAt: lastEventAt(application, ["follow_up"]) },
    job: { id: application.job.id, title: application.job.title, company: application.job.company, description: application.job.description, updatedAt: application.job.updatedAt },
    interviewAt: interviewAt(application),
    evaluations: (evaluationsByJob.get(application.jobId) ?? []).filter(value => value.applicationId === application.id).map(value => ({ status: value.status, cvVersionId: value.cvVersionId, jobUpdatedAt: undefined }))
  }).intents);
  const results = [];
  for (const intent of intents) results.push(await executeIntent(repository, rules, intent));
  return { evaluated: applications.length, intents: intents.length, succeeded: results.filter(item => item.status === "succeeded").length, failed: results.filter(item => item.status === "failed").length, skipped: results.filter(item => item.status === "skipped").length };
}
