import {
  DEFAULT_AUTOMATION_RETRY_POLICY,
  type AutomationExecution,
  type AutomationExecutionState,
  type AutomationFailure,
  type AutomationIntent,
  type AutomationRetryPolicy,
} from "./types";

type Instant = Date | string | number;

export class AutomationTransitionError extends Error {
  readonly from: AutomationExecutionState;
  readonly operation: string;

  constructor(from: AutomationExecutionState, operation: string, detail?: string) {
    super(`Cannot ${operation} an automation execution in ${from} state${detail ? `: ${detail}` : ""}`);
    this.name = "AutomationTransitionError";
    this.from = from;
    this.operation = operation;
  }
}

function timestamp(at: Instant): number {
  const value = at instanceof Date ? at.getTime() : typeof at === "number" ? at : Date.parse(at);
  if (!Number.isFinite(value)) throw new TypeError("A valid execution instant is required");
  return value;
}

function iso(at: Instant): string {
  return new Date(timestamp(at)).toISOString();
}

function assertRetryPolicy(policy: AutomationRetryPolicy): AutomationRetryPolicy {
  if (!Number.isSafeInteger(policy.maxAttempts) || policy.maxAttempts < 1) {
    throw new TypeError("maxAttempts must be a positive safe integer");
  }
  if (!Number.isSafeInteger(policy.initialDelayMs) || policy.initialDelayMs < 0) {
    throw new TypeError("initialDelayMs must be a non-negative safe integer");
  }
  if (!Number.isFinite(policy.multiplier) || policy.multiplier < 1) {
    throw new TypeError("multiplier must be a finite number greater than or equal to 1");
  }
  if (!Number.isSafeInteger(policy.maxDelayMs) || policy.maxDelayMs < policy.initialDelayMs) {
    throw new TypeError("maxDelayMs must be a safe integer greater than or equal to initialDelayMs");
  }
  return Object.freeze({ ...policy });
}

function copyIntent(intent: AutomationIntent): AutomationIntent {
  if (intent.action === "reminder.create") {
    return { ...intent, payload: { ...intent.payload } };
  }
  return { ...intent, payload: { ...intent.payload } };
}

function assertRunning(execution: AutomationExecution, operation: string): void {
  if (execution.state !== "running") throw new AutomationTransitionError(execution.state, operation);
}

export function calculateAutomationRetryDelay(
  policy: Readonly<AutomationRetryPolicy>,
  failedAttempt: number,
): number {
  assertRetryPolicy(policy);
  if (!Number.isSafeInteger(failedAttempt) || failedAttempt < 1) {
    throw new TypeError("failedAttempt must be a positive safe integer");
  }
  const exponential = policy.initialDelayMs * policy.multiplier ** (failedAttempt - 1);
  return Math.min(policy.maxDelayMs, Math.round(exponential));
}

export function createAutomationExecution(
  intent: AutomationIntent,
  at: Instant,
  retryPolicy: Readonly<AutomationRetryPolicy> = DEFAULT_AUTOMATION_RETRY_POLICY,
): AutomationExecution {
  if (intent.idempotencyKey.trim().length === 0) throw new TypeError("idempotencyKey must not be empty");
  if (intent.ruleId.trim().length === 0) throw new TypeError("ruleId must not be empty");
  if (intent.userId.trim().length === 0) throw new TypeError("userId must not be empty");
  if (intent.applicationId.trim().length === 0) throw new TypeError("applicationId must not be empty");
  const createdTimestamp = timestamp(at);
  const availableTimestamp = timestamp(intent.availableAt);
  const createdAt = iso(createdTimestamp);
  const policy = assertRetryPolicy(retryPolicy);
  return {
    idempotencyKey: intent.idempotencyKey,
    ruleId: intent.ruleId,
    intent: copyIntent(intent),
    state: "queued",
    attempts: 0,
    retryPolicy: policy,
    createdAt,
    updatedAt: createdAt,
    nextAttemptAt: iso(Math.max(createdTimestamp, availableTimestamp)),
    lastStartedAt: null,
    finishedAt: null,
    cancelledAt: null,
    cancellationReason: null,
    lastError: null,
  };
}

export function isAutomationExecutionReady(execution: Readonly<AutomationExecution>, at: Instant): boolean {
  if (execution.state !== "queued" && execution.state !== "retry_scheduled") return false;
  if (!execution.nextAttemptAt) return false;
  return timestamp(at) >= timestamp(execution.nextAttemptAt);
}

export function startAutomationExecution(
  execution: Readonly<AutomationExecution>,
  at: Instant,
): AutomationExecution {
  if (execution.state !== "queued" && execution.state !== "retry_scheduled") {
    throw new AutomationTransitionError(execution.state, "start");
  }
  if (!isAutomationExecutionReady(execution, at)) {
    throw new AutomationTransitionError(execution.state, "start", "the retry delay has not elapsed");
  }
  const startedAt = iso(at);
  return {
    ...execution,
    state: "running",
    attempts: execution.attempts + 1,
    updatedAt: startedAt,
    nextAttemptAt: null,
    lastStartedAt: startedAt,
  };
}

export function succeedAutomationExecution(
  execution: Readonly<AutomationExecution>,
  at: Instant,
): AutomationExecution {
  assertRunning(execution, "succeed");
  const finishedAt = iso(at);
  return {
    ...execution,
    state: "succeeded",
    updatedAt: finishedAt,
    finishedAt,
    nextAttemptAt: null,
  };
}

export function failAutomationExecution(
  execution: Readonly<AutomationExecution>,
  failure: Readonly<AutomationFailure>,
  at: Instant,
): AutomationExecution {
  assertRunning(execution, "fail");
  if (failure.message.trim().length === 0) throw new TypeError("Failure message must not be empty");

  const failedTimestamp = timestamp(at);
  const failedAt = iso(failedTimestamp);
  const retryable = failure.retryable ?? true;
  const lastError = {
    message: failure.message,
    code: failure.code ?? null,
    retryable,
    attempt: execution.attempts,
    failedAt,
  };
  const canRetry = retryable && execution.attempts < execution.retryPolicy.maxAttempts;

  if (canRetry) {
    const delay = calculateAutomationRetryDelay(execution.retryPolicy, execution.attempts);
    return {
      ...execution,
      state: "retry_scheduled",
      updatedAt: failedAt,
      nextAttemptAt: iso(failedTimestamp + delay),
      finishedAt: null,
      lastError,
    };
  }

  return {
    ...execution,
    state: "failed",
    updatedAt: failedAt,
    nextAttemptAt: null,
    finishedAt: failedAt,
    lastError,
  };
}

export function cancelAutomationExecution(
  execution: Readonly<AutomationExecution>,
  reason: string,
  at: Instant,
): AutomationExecution {
  if (execution.state === "cancelled") return { ...execution };
  if (execution.state === "succeeded" || execution.state === "failed") {
    throw new AutomationTransitionError(execution.state, "cancel", "the execution is already terminal");
  }
  if (reason.trim().length === 0) throw new TypeError("Cancellation reason must not be empty");
  const cancelledAt = iso(at);
  return {
    ...execution,
    state: "cancelled",
    updatedAt: cancelledAt,
    nextAttemptAt: null,
    finishedAt: cancelledAt,
    cancelledAt,
    cancellationReason: reason,
  };
}
