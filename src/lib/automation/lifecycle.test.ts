import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AutomationTransitionError,
  calculateAutomationRetryDelay,
  cancelAutomationExecution,
  createAutomationExecution,
  failAutomationExecution,
  isAutomationExecutionReady,
  startAutomationExecution,
  succeedAutomationExecution,
  systemAutomationClock,
  type AutomationIntent,
  type AutomationRetryPolicy,
} from "./index";

const intent: AutomationIntent = {
  ruleId: "auto-evaluation",
  action: "evaluation.request",
  idempotencyKey: "automation:v1:auto-evaluation:test",
  userId: "user-1",
  applicationId: "application-1",
  availableAt: "2026-02-01T10:00:00.000Z",
  reason: "Eligible",
  payload: { jobId: "job-1", cvVersionId: "cv-1", jobUpdatedAt: "2026-02-01T09:00:00.000Z" },
};

const retryPolicy: AutomationRetryPolicy = {
  maxAttempts: 3,
  initialDelayMs: 1_000,
  multiplier: 2,
  maxDelayMs: 10_000,
};

describe("automation execution lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-01T10:00:00.000Z"));
  });

  afterEach(() => vi.useRealTimers());

  it("retries with exponential backoff and ends after maxAttempts", () => {
    const queued = createAutomationExecution(intent, systemAutomationClock.now(), retryPolicy);
    const firstRunning = startAutomationExecution(queued, systemAutomationClock.now());
    const firstRetry = failAutomationExecution(
      firstRunning,
      { message: "rate limited", code: "429" },
      systemAutomationClock.now(),
    );

    expect(firstRetry).toMatchObject({
      state: "retry_scheduled",
      attempts: 1,
      nextAttemptAt: "2026-02-01T10:00:01.000Z",
    });
    expect(queued).toMatchObject({ state: "queued", attempts: 0 });
    expect(isAutomationExecutionReady(firstRetry, systemAutomationClock.now())).toBe(false);
    expect(() => startAutomationExecution(firstRetry, systemAutomationClock.now())).toThrow(
      AutomationTransitionError,
    );

    vi.advanceTimersByTime(1_000);
    const secondRunning = startAutomationExecution(firstRetry, systemAutomationClock.now());
    const secondRetry = failAutomationExecution(
      secondRunning,
      { message: "still limited" },
      systemAutomationClock.now(),
    );
    expect(secondRetry).toMatchObject({
      attempts: 2,
      nextAttemptAt: "2026-02-01T10:00:03.000Z",
    });

    vi.advanceTimersByTime(2_000);
    const thirdRunning = startAutomationExecution(secondRetry, systemAutomationClock.now());
    const terminal = failAutomationExecution(
      thirdRunning,
      { message: "exhausted" },
      systemAutomationClock.now(),
    );
    expect(terminal).toMatchObject({
      state: "failed",
      attempts: 3,
      nextAttemptAt: null,
      finishedAt: "2026-02-01T10:00:03.000Z",
    });
  });

  it("does not retry a non-retryable failure", () => {
    const running = startAutomationExecution(
      createAutomationExecution(intent, systemAutomationClock.now(), retryPolicy),
      systemAutomationClock.now(),
    );
    const failed = failAutomationExecution(
      running,
      { message: "invalid payload", retryable: false },
      systemAutomationClock.now(),
    );
    expect(failed).toMatchObject({ state: "failed", attempts: 1, nextAttemptAt: null });
  });

  it("does not start an intent before its availableAt instant", () => {
    const futureIntent: AutomationIntent = {
      ...intent,
      availableAt: "2026-02-01T10:05:00.000Z",
    };
    const queued = createAutomationExecution(futureIntent, systemAutomationClock.now(), retryPolicy);

    expect(queued.nextAttemptAt).toBe("2026-02-01T10:05:00.000Z");
    expect(isAutomationExecutionReady(queued, systemAutomationClock.now())).toBe(false);
    vi.advanceTimersByTime(5 * 60_000);
    expect(startAutomationExecution(queued, systemAutomationClock.now()).state).toBe("running");
  });

  it("cancels active work idempotently and prevents later starts", () => {
    const queued = createAutomationExecution(intent, systemAutomationClock.now(), retryPolicy);
    const cancelled = cancelAutomationExecution(queued, "Application was withdrawn", systemAutomationClock.now());
    const cancelledAgain = cancelAutomationExecution(
      cancelled,
      "A duplicate cancellation",
      new Date("2026-02-01T11:00:00.000Z"),
    );

    expect(cancelledAgain).toEqual(cancelled);
    expect(cancelled).toMatchObject({
      state: "cancelled",
      cancellationReason: "Application was withdrawn",
      nextAttemptAt: null,
    });
    expect(() => startAutomationExecution(cancelled, systemAutomationClock.now())).toThrow(
      AutomationTransitionError,
    );
  });

  it("marks a running execution as succeeded", () => {
    const running = startAutomationExecution(
      createAutomationExecution(intent, systemAutomationClock.now()),
      systemAutomationClock.now(),
    );
    vi.advanceTimersByTime(250);
    const succeeded = succeedAutomationExecution(running, systemAutomationClock.now());
    expect(succeeded).toMatchObject({
      state: "succeeded",
      attempts: 1,
      finishedAt: "2026-02-01T10:00:00.250Z",
    });
    expect(() => cancelAutomationExecution(succeeded, "too late", systemAutomationClock.now())).toThrow(
      AutomationTransitionError,
    );
  });

  it("caps backoff at maxDelayMs", () => {
    expect(
      calculateAutomationRetryDelay(
        { maxAttempts: 10, initialDelayMs: 1_000, multiplier: 3, maxDelayMs: 5_000 },
        4,
      ),
    ).toBe(5_000);
  });
});
