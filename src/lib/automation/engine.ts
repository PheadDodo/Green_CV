import { createDefaultAutomationRules } from "./rules";
import type {
  AutomationClock,
  AutomationEvaluationResult,
  AutomationRule,
  AutomationRuleConfig,
  AutomationSnapshot,
} from "./types";

export const systemAutomationClock: AutomationClock = Object.freeze({
  now: () => new Date(),
});

export class AutomationInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AutomationInputError";
  }
}

export interface AutomationEngineOptions {
  clock?: AutomationClock;
  rules?: readonly AutomationRule[];
  ruleConfig?: Partial<AutomationRuleConfig>;
}

export interface AutomationEngine {
  evaluate(snapshot: Readonly<AutomationSnapshot>): AutomationEvaluationResult;
}

function requireIdentifier(value: string, name: string): void {
  if (value.trim().length === 0) throw new AutomationInputError(`${name} must not be empty`);
}

function validateSnapshot(snapshot: Readonly<AutomationSnapshot>): void {
  requireIdentifier(snapshot.userId, "userId");
  requireIdentifier(snapshot.application.id, "application.id");
  requireIdentifier(snapshot.application.jobId, "application.jobId");
  requireIdentifier(snapshot.job.id, "job.id");
  if (snapshot.application.jobId !== snapshot.job.id) {
    throw new AutomationInputError("application.jobId must match job.id");
  }
}

export function createAutomationEngine(options: AutomationEngineOptions = {}): AutomationEngine {
  if (options.rules && options.ruleConfig) {
    throw new AutomationInputError("Supply custom rules or ruleConfig, not both");
  }

  const clock = options.clock ?? systemAutomationClock;
  const rules = options.rules ?? createDefaultAutomationRules(options.ruleConfig);
  const ruleIds = new Set<string>();
  for (const rule of rules) {
    requireIdentifier(rule.id, "rule.id");
    if (ruleIds.has(rule.id)) throw new AutomationInputError(`Duplicate automation rule id: ${rule.id}`);
    ruleIds.add(rule.id);
  }

  return Object.freeze({
    evaluate(snapshot: Readonly<AutomationSnapshot>): AutomationEvaluationResult {
      validateSnapshot(snapshot);
      const now = clock.now();
      if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
        throw new AutomationInputError("Automation clock returned an invalid Date");
      }

      const decisions = rules.map((rule) => {
        const decision = rule.evaluate(snapshot, { now: new Date(now.getTime()) });
        if (decision.ruleId !== rule.id) {
          throw new AutomationInputError(`Rule ${rule.id} returned a decision for ${decision.ruleId}`);
        }
        if (decision.outcome === "emitted" && !decision.intent) {
          throw new AutomationInputError(`Rule ${rule.id} emitted without an intent`);
        }
        if (decision.intent && decision.intent.ruleId !== rule.id) {
          throw new AutomationInputError(`Rule ${rule.id} emitted an intent for ${decision.intent.ruleId}`);
        }
        return decision;
      });

      return {
        evaluatedAt: now.toISOString(),
        decisions: Object.freeze(decisions),
        intents: Object.freeze(
          decisions.flatMap((decision) => (decision.intent ? [decision.intent] : [])),
        ),
      };
    },
  });
}
