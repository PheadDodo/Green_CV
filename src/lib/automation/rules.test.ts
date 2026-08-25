import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAutomationEngine,
  createAutomationIdempotencyKey,
  type AutomationSnapshot,
} from "./index";

function snapshot(overrides: Partial<AutomationSnapshot> = {}): AutomationSnapshot {
  const base: AutomationSnapshot = {
    userId: "user-1",
    application: {
      id: "application-1",
      jobId: "job-1",
      status: "applied",
      cvVersionId: "cv-1",
      appliedAt: "2026-01-01T09:00:00.000Z",
    },
    job: {
      id: "job-1",
      title: "Machine Learning Engineer",
      company: "Northstar",
      description: "Build and operate reliable machine learning systems in production.",
      updatedAt: "2026-01-01T08:00:00.000Z",
    },
    evaluations: [],
  };
  return {
    ...base,
    ...overrides,
    application: { ...base.application, ...overrides.application },
    job: { ...base.job, ...overrides.job },
  };
}

describe("automation rules", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-08T08:59:59.000Z"));
  });

  afterEach(() => vi.useRealTimers());

  it("emits a follow-up once its waiting period elapses and keeps a stable key", () => {
    const engine = createAutomationEngine({
      ruleConfig: { followUpDelayMs: 7 * 24 * 60 * 60 * 1_000 },
    });

    const early = engine.evaluate(snapshot());
    expect(early.decisions[0]).toMatchObject({
      outcome: "not_due",
      nextEvaluationAt: "2026-01-08T09:00:00.000Z",
    });

    vi.setSystemTime(new Date("2026-01-08T09:00:00.000Z"));
    const due = engine.evaluate(snapshot());
    expect(due.intents[0]).toMatchObject({
      action: "reminder.create",
      availableAt: "2026-01-08T09:00:00.000Z",
      payload: { kind: "follow_up", dueAt: "2026-01-08T09:00:00.000Z" },
    });

    vi.setSystemTime(new Date("2026-01-09T09:00:00.000Z"));
    expect(engine.evaluate(snapshot()).intents[0]?.idempotencyKey).toBe(
      due.intents[0]?.idempotencyKey,
    );
  });

  it("starts a new follow-up window after later employer contact", () => {
    vi.setSystemTime(new Date("2026-01-09T09:00:00.000Z"));
    const engine = createAutomationEngine();
    const original = engine.evaluate(snapshot()).intents[0];
    const afterContact = engine.evaluate(
      snapshot({
        application: {
          ...snapshot().application,
          lastEmployerContactAt: "2026-01-05T09:00:00.000Z",
        },
      }),
    );

    expect(afterContact.decisions[0]).toMatchObject({
      outcome: "not_due",
      nextEvaluationAt: "2026-01-12T09:00:00.000Z",
    });
    expect(original).toBeDefined();
  });

  it("opens interview preparation at the configured lead time and closes after start", () => {
    const interview = snapshot({
      application: { ...snapshot().application, status: "interview" },
      interviewAt: "2026-01-09T09:00:00.000Z",
    });
    const engine = createAutomationEngine();

    expect(engine.evaluate(interview).decisions[1].outcome).toBe("not_due");
    vi.setSystemTime(new Date("2026-01-08T09:00:00.000Z"));
    expect(engine.evaluate(interview).intents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "reminder.create",
          payload: expect.objectContaining({ kind: "interview_prep" }),
        }),
      ]),
    );
    vi.setSystemTime(new Date("2026-01-09T09:00:00.000Z"));
    expect(engine.evaluate(interview).decisions[1].outcome).toBe("ineligible");
  });

  it("emits auto-evaluation only with sufficient current inputs", () => {
    const engine = createAutomationEngine();
    const eligible = engine.evaluate(snapshot());
    const request = eligible.intents.find((intent) => intent.action === "evaluation.request");
    expect(request).toMatchObject({
      payload: { jobId: "job-1", cvVersionId: "cv-1" },
    });

    const existing = engine.evaluate(
      snapshot({
        evaluations: [
          { status: "completed", cvVersionId: "cv-1", jobUpdatedAt: "2026-01-01T08:00:00.000Z" },
        ],
      }),
    );
    expect(existing.decisions[2]).toMatchObject({ outcome: "ineligible" });

    const newRevision = engine.evaluate(
      snapshot({
        job: { ...snapshot().job, updatedAt: "2026-01-02T08:00:00.000Z" },
        evaluations: [
          { status: "completed", cvVersionId: "cv-1", jobUpdatedAt: "2026-01-01T08:00:00.000Z" },
        ],
      }),
    );
    expect(newRevision.intents.some((intent) => intent.action === "evaluation.request")).toBe(true);

    expect(
      engine.evaluate(snapshot({ application: { ...snapshot().application, cvVersionId: null } }))
        .decisions[2].outcome,
    ).toBe("ineligible");
  });

  it("builds deterministic type-sensitive keys without leaking dimensions", () => {
    const left = createAutomationIdempotencyKey("custom-rule", { user: "secret-user", attempt: 1 });
    const reordered = createAutomationIdempotencyKey("custom-rule", {
      attempt: 1,
      user: "secret-user",
    });
    const stringAttempt = createAutomationIdempotencyKey("custom-rule", {
      user: "secret-user",
      attempt: "1",
    });

    expect(left).toBe(reordered);
    expect(left).not.toBe(stringAttempt);
    expect(left).not.toContain("secret-user");
    expect(left).toMatch(/^automation:v1:custom-rule:[a-f0-9]{64}$/);
  });

  it("rejects mismatched application and job facts", () => {
    const engine = createAutomationEngine();
    expect(() =>
      engine.evaluate(snapshot({ job: { ...snapshot().job, id: "different-job" } })),
    ).toThrow("application.jobId must match job.id");
  });
});
