import { afterEach, describe, expect, it } from "vitest";

import type { Evaluation } from "./data/types";
import { countEvaluationsToday, getDailyEvaluationLimit } from "./evaluation-quota";

const originalLimit = process.env.MAX_EVALUATIONS_PER_DAY;

afterEach(() => {
  if (originalLimit === undefined) delete process.env.MAX_EVALUATIONS_PER_DAY;
  else process.env.MAX_EVALUATIONS_PER_DAY = originalLimit;
});

function evaluation(createdAt: string): Evaluation {
  return { createdAt } as Evaluation;
}

describe("evaluation quota", () => {
  it("defaults to a conservative paid-evaluation limit", () => {
    delete process.env.MAX_EVALUATIONS_PER_DAY;
    expect(getDailyEvaluationLimit()).toBe(20);
  });

  it("validates configured limits", () => {
    process.env.MAX_EVALUATIONS_PER_DAY = "0";
    expect(getDailyEvaluationLimit()).toBe(0);
    process.env.MAX_EVALUATIONS_PER_DAY = "unlimited";
    expect(() => getDailyEvaluationLimit()).toThrow(/whole number/i);
  });

  it("counts attempts within the current UTC day", () => {
    const now = new Date("2026-08-25T12:00:00.000Z");
    expect(
      countEvaluationsToday(
        [
          evaluation("2026-08-25T00:00:00.000Z"),
          evaluation("2026-08-25T11:59:59.000Z"),
          evaluation("2026-08-24T23:59:59.999Z"),
          evaluation("invalid"),
        ],
        now,
      ),
    ).toBe(2);
  });
});
