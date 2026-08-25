import { createAutomationIdempotencyKey } from "./idempotency";
import {
  DEFAULT_AUTOMATION_RULE_CONFIG,
  type AutomationIntent,
  type AutomationRule,
  type AutomationRuleConfig,
  type AutomationRuleDecision,
  type AutomationSnapshot,
} from "./types";

const ACTIVE_EVALUATION_STATUSES = new Set(["pending", "running", "completed"]);
const AUTO_EVALUATION_APPLICATION_STATUSES = new Set([
  "saved",
  "applied",
  "screening",
  "interview",
  "offer",
]);

function invalidOrTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function iso(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

function ineligible(ruleId: string, reason: string): AutomationRuleDecision {
  return { ruleId, outcome: "ineligible", reason, nextEvaluationAt: null, intent: null };
}

function notDue(ruleId: string, reason: string, nextEvaluationAt: number): AutomationRuleDecision {
  return {
    ruleId,
    outcome: "not_due",
    reason,
    nextEvaluationAt: iso(nextEvaluationAt),
    intent: null,
  };
}

function emitted(intent: AutomationIntent): AutomationRuleDecision {
  return {
    ruleId: intent.ruleId,
    outcome: "emitted",
    reason: intent.reason,
    nextEvaluationAt: null,
    intent,
  };
}

function positiveDuration(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer`);
  }
  return value;
}

export function createFollowUpReminderRule(
  delayMs = DEFAULT_AUTOMATION_RULE_CONFIG.followUpDelayMs,
): AutomationRule {
  positiveDuration(delayMs, "followUpDelayMs");
  const id = "follow-up-reminder";

  return {
    id,
    evaluate(snapshot, context) {
      if (snapshot.application.status !== "applied") {
        return ineligible(id, "Follow-up reminders only apply while awaiting a response");
      }

      const appliedAt = invalidOrTimestamp(snapshot.application.appliedAt);
      if (appliedAt === null) return ineligible(id, "A valid appliedAt instant is required");

      const contactValue = snapshot.application.lastEmployerContactAt;
      const contactAt = invalidOrTimestamp(contactValue);
      if (contactValue && contactAt === null) {
        return ineligible(id, "lastEmployerContactAt is not a valid instant");
      }

      const anchorAt = Math.max(appliedAt, contactAt ?? appliedAt);
      const dueAt = anchorAt + delayMs;
      if (context.now.getTime() < dueAt) {
        return notDue(id, "The follow-up waiting period has not elapsed", dueAt);
      }

      return emitted({
        ruleId: id,
        action: "reminder.create",
        idempotencyKey: createAutomationIdempotencyKey(id, {
          userId: snapshot.userId,
          applicationId: snapshot.application.id,
          anchorAt: iso(anchorAt),
        }),
        userId: snapshot.userId,
        applicationId: snapshot.application.id,
        availableAt: iso(dueAt),
        reason: "No employer response was recorded during the follow-up window",
        payload: {
          kind: "follow_up",
          title: `Follow up with ${snapshot.job.company}`,
          notes: `Follow up about the ${snapshot.job.title} application.`,
          dueAt: iso(dueAt),
        },
      });
    },
  };
}

export function createInterviewPrepRule(
  leadMs = DEFAULT_AUTOMATION_RULE_CONFIG.interviewPrepLeadMs,
): AutomationRule {
  positiveDuration(leadMs, "interviewPrepLeadMs");
  const id = "interview-prep";

  return {
    id,
    evaluate(snapshot, context) {
      if (snapshot.application.status !== "interview") {
        return ineligible(id, "Interview preparation requires an interview-stage application");
      }

      const interviewAt = invalidOrTimestamp(snapshot.interviewAt);
      if (interviewAt === null) return ineligible(id, "A valid future interviewAt instant is required");

      const now = context.now.getTime();
      if (interviewAt <= now) return ineligible(id, "The scheduled interview has already started");

      const prepAt = interviewAt - leadMs;
      if (now < prepAt) {
        return notDue(id, "The interview preparation window has not opened", prepAt);
      }

      return emitted({
        ruleId: id,
        action: "reminder.create",
        idempotencyKey: createAutomationIdempotencyKey(id, {
          userId: snapshot.userId,
          applicationId: snapshot.application.id,
          interviewAt: iso(interviewAt),
        }),
        userId: snapshot.userId,
        applicationId: snapshot.application.id,
        availableAt: iso(prepAt),
        reason: "The interview preparation window is open",
        payload: {
          kind: "interview_prep",
          title: `Prepare for ${snapshot.job.company} interview`,
          notes: `Review the ${snapshot.job.title} role before the interview at ${iso(interviewAt)}.`,
          dueAt: iso(prepAt),
        },
      });
    },
  };
}

export function createAutoEvaluationRule(
  minimumDescriptionLength = DEFAULT_AUTOMATION_RULE_CONFIG.minimumJobDescriptionLength,
): AutomationRule {
  positiveDuration(minimumDescriptionLength, "minimumJobDescriptionLength");
  const id = "auto-evaluation";

  return {
    id,
    evaluate(snapshot, context) {
      if (!AUTO_EVALUATION_APPLICATION_STATUSES.has(snapshot.application.status)) {
        return ineligible(id, "Terminal applications are not eligible for automatic evaluation");
      }

      const cvVersionId = snapshot.application.cvVersionId?.trim();
      if (!cvVersionId) return ineligible(id, "A CV version must be attached before evaluation");

      if (snapshot.job.description.trim().length < minimumDescriptionLength) {
        return ineligible(id, "The job description is too short to evaluate reliably");
      }

      const currentEvaluationExists = (snapshot.evaluations ?? []).some((evaluation) => {
        const coversJobRevision =
          evaluation.jobUpdatedAt == null || evaluation.jobUpdatedAt === snapshot.job.updatedAt;
        return (
          evaluation.cvVersionId === cvVersionId &&
          coversJobRevision &&
          ACTIVE_EVALUATION_STATUSES.has(evaluation.status)
        );
      });
      if (currentEvaluationExists) {
        return ineligible(id, "This CV and job revision already has an active or completed evaluation");
      }

      const now = context.now.toISOString();
      return emitted({
        ruleId: id,
        action: "evaluation.request",
        idempotencyKey: createAutomationIdempotencyKey(id, {
          userId: snapshot.userId,
          applicationId: snapshot.application.id,
          jobId: snapshot.job.id,
          jobUpdatedAt: snapshot.job.updatedAt,
          cvVersionId,
        }),
        userId: snapshot.userId,
        applicationId: snapshot.application.id,
        availableAt: now,
        reason: "A CV and sufficient job description are available without a current evaluation",
        payload: {
          jobId: snapshot.job.id,
          cvVersionId,
          jobUpdatedAt: snapshot.job.updatedAt,
        },
      });
    },
  };
}

export function createDefaultAutomationRules(
  config: Partial<AutomationRuleConfig> = {},
): readonly AutomationRule[] {
  const resolved = { ...DEFAULT_AUTOMATION_RULE_CONFIG, ...config };
  return Object.freeze([
    createFollowUpReminderRule(resolved.followUpDelayMs),
    createInterviewPrepRule(resolved.interviewPrepLeadMs),
    createAutoEvaluationRule(resolved.minimumJobDescriptionLength),
  ]);
}

export function isAutoEvaluationEligible(
  snapshot: Readonly<AutomationSnapshot>,
  minimumDescriptionLength = DEFAULT_AUTOMATION_RULE_CONFIG.minimumJobDescriptionLength,
): boolean {
  const rule = createAutoEvaluationRule(minimumDescriptionLength);
  const decision = rule.evaluate(snapshot, { now: new Date(0) });
  return decision.outcome === "emitted";
}
