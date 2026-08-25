import type { ApplicationStatus, EvaluationStatus } from "../data/types";

export const BUILT_IN_AUTOMATION_RULE_IDS = [
  "follow-up-reminder",
  "interview-prep",
  "auto-evaluation",
] as const;

export type BuiltInAutomationRuleId = (typeof BUILT_IN_AUTOMATION_RULE_IDS)[number];

export interface AutomationClock {
  now(): Date;
}

export interface AutomationApplicationSnapshot {
  id: string;
  jobId: string;
  status: ApplicationStatus;
  cvVersionId: string | null;
  appliedAt: string | null;
  /** The most recent outbound contact. When absent, appliedAt is the follow-up anchor. */
  lastEmployerContactAt?: string | null;
}

export interface AutomationJobSnapshot {
  id: string;
  title: string;
  company: string;
  description: string;
  /** A stable job revision marker used by auto-evaluation idempotency. */
  updatedAt: string;
}

export interface AutomationEvaluationSnapshot {
  status: EvaluationStatus;
  cvVersionId: string | null;
  /**
   * The job revision evaluated. A missing value is treated conservatively as
   * covering the current revision, preventing duplicate legacy evaluations.
   */
  jobUpdatedAt?: string | null;
}

export interface AutomationSnapshot {
  userId: string;
  application: AutomationApplicationSnapshot;
  job: AutomationJobSnapshot;
  /** ISO instant for the next scheduled interview, when one exists. */
  interviewAt?: string | null;
  evaluations?: readonly AutomationEvaluationSnapshot[];
}

interface AutomationIntentBase {
  ruleId: string;
  idempotencyKey: string;
  userId: string;
  applicationId: string;
  /** Earliest instant at which a worker should execute this intent. */
  availableAt: string;
  reason: string;
}

export interface ReminderAutomationIntent extends AutomationIntentBase {
  action: "reminder.create";
  payload: {
    kind: "follow_up" | "interview_prep";
    title: string;
    notes: string;
    dueAt: string;
  };
}

export interface EvaluationAutomationIntent extends AutomationIntentBase {
  action: "evaluation.request";
  payload: {
    jobId: string;
    cvVersionId: string;
    jobUpdatedAt: string;
  };
}

export type AutomationIntent = ReminderAutomationIntent | EvaluationAutomationIntent;

export type AutomationDecisionOutcome = "emitted" | "not_due" | "ineligible";

export interface AutomationRuleDecision {
  ruleId: string;
  outcome: AutomationDecisionOutcome;
  reason: string;
  /** When known, the earliest useful time to evaluate this rule again. */
  nextEvaluationAt: string | null;
  intent: AutomationIntent | null;
}

export interface AutomationRuleContext {
  now: Date;
}

export interface AutomationRule {
  readonly id: string;
  evaluate(
    snapshot: Readonly<AutomationSnapshot>,
    context: Readonly<AutomationRuleContext>,
  ): AutomationRuleDecision;
}

export interface AutomationEvaluationResult {
  evaluatedAt: string;
  decisions: readonly AutomationRuleDecision[];
  intents: readonly AutomationIntent[];
}

export interface AutomationRuleConfig {
  followUpDelayMs: number;
  interviewPrepLeadMs: number;
  minimumJobDescriptionLength: number;
}

export const DEFAULT_AUTOMATION_RULE_CONFIG: Readonly<AutomationRuleConfig> = Object.freeze({
  followUpDelayMs: 7 * 24 * 60 * 60 * 1_000,
  interviewPrepLeadMs: 24 * 60 * 60 * 1_000,
  minimumJobDescriptionLength: 40,
});

export const AUTOMATION_EXECUTION_STATES = [
  "queued",
  "running",
  "retry_scheduled",
  "succeeded",
  "failed",
  "cancelled",
] as const;

export type AutomationExecutionState = (typeof AUTOMATION_EXECUTION_STATES)[number];

export interface AutomationRetryPolicy {
  /** Includes the initial attempt. */
  maxAttempts: number;
  initialDelayMs: number;
  multiplier: number;
  maxDelayMs: number;
}

export const DEFAULT_AUTOMATION_RETRY_POLICY: Readonly<AutomationRetryPolicy> = Object.freeze({
  maxAttempts: 4,
  initialDelayMs: 30_000,
  multiplier: 2,
  maxDelayMs: 15 * 60_000,
});

export interface AutomationFailure {
  message: string;
  code?: string;
  /** Defaults to true. */
  retryable?: boolean;
}

export interface AutomationFailureRecord {
  message: string;
  code: string | null;
  retryable: boolean;
  attempt: number;
  failedAt: string;
}

export interface AutomationExecution {
  idempotencyKey: string;
  ruleId: string;
  intent: AutomationIntent;
  state: AutomationExecutionState;
  attempts: number;
  retryPolicy: AutomationRetryPolicy;
  createdAt: string;
  updatedAt: string;
  nextAttemptAt: string | null;
  lastStartedAt: string | null;
  finishedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  lastError: AutomationFailureRecord | null;
}
