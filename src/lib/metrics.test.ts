import { describe, expect, it } from "vitest";
import { calculateDashboardMetrics, calculatePipelineSummary, type MetricApplication } from "./metrics";

const now = new Date("2026-08-21T12:00:00.000Z");

function application(overrides: Partial<MetricApplication> & Pick<MetricApplication, "id">): MetricApplication {
  return {
    status: "saved",
    discoveredAt: "2026-08-10T12:00:00.000Z",
    appliedAt: null,
    latestEvaluationScore: null,
    events: [],
    ...overrides
  };
}

describe("calculateDashboardMetrics", () => {
  it("uses the submitted cohort for response rate and distinct applications for funnel stages", () => {
    const result = calculateDashboardMetrics([
      application({ id: "a", status: "interview", appliedAt: "2026-08-11T12:00:00.000Z", latestEvaluationScore: 82, events: [
        { eventType: "status_changed", toStatus: "applied", occurredAt: "2026-08-11T12:00:00.000Z" },
        { eventType: "response_received", occurredAt: "2026-08-13T12:00:00.000Z" },
        { eventType: "interview_scheduled", toStatus: "interview", occurredAt: "2026-08-18T12:00:00.000Z" },
        { eventType: "interview_scheduled", toStatus: "interview", occurredAt: "2026-08-19T12:00:00.000Z" }
      ] }),
      application({ id: "b", status: "applied", appliedAt: "2026-08-14T12:00:00.000Z", latestEvaluationScore: 68, events: [
        { eventType: "status_changed", toStatus: "applied", occurredAt: "2026-08-14T12:00:00.000Z" }
      ] }),
      application({ id: "c", status: "offer", appliedAt: "2026-08-01T12:00:00.000Z", events: [
        { eventType: "response_received", occurredAt: "2026-08-03T12:00:00.000Z" },
        { eventType: "status_changed", toStatus: "offer", occurredAt: "2026-08-20T12:00:00.000Z" }
      ] })
    ], { now });

    expect(result.activeApplications).toBe(2);
    expect(result.responseRate).toBe(67);
    expect(result.interviews).toBe(1);
    expect(result.averageFit).toBe(75);
    expect(result.funnel).toEqual([
      { stage: "Discovered", value: 3 },
      { stage: "Applied", value: 3 },
      { stage: "Responded", value: 2 },
      { stage: "Interview", value: 1 },
      { stage: "Offer", value: 1 }
    ]);
  });

  it("counts every application once in the current status breakdown", () => {
    const result = calculateDashboardMetrics([
      application({ id: "saved", status: "saved" }),
      application({ id: "applied", status: "applied" }),
      application({ id: "screening", status: "screening" }),
      application({ id: "interview", status: "interview" }),
      application({ id: "offer", status: "offer" }),
      application({ id: "rejected", status: "rejected" }),
      application({ id: "withdrawn", status: "withdrawn" }),
      application({ id: "archived", status: "archived" }),
    ], { now });

    expect(result.statusBreakdown).toEqual([
      { status: "Saved", value: 1 },
      { status: "Applied", value: 1 },
      { status: "Screening", value: 1 },
      { status: "Interview", value: 1 },
      { status: "Offer", value: 1 },
      { status: "Closed", value: 3 },
    ]);
  });

  it("returns meaningful zeroes for an empty workspace", () => {
    expect(calculateDashboardMetrics([], { now })).toEqual({
      activeApplications: 0,
      responseRate: 0,
      interviews: 0,
      averageFit: 0,
      funnel: [
        { stage: "Discovered", value: 0 },
        { stage: "Applied", value: 0 },
        { stage: "Responded", value: 0 },
        { stage: "Interview", value: 0 },
        { stage: "Offer", value: 0 }
      ],
      statusBreakdown: [
        { status: "Saved", value: 0 },
        { status: "Applied", value: 0 },
        { status: "Screening", value: 0 },
        { status: "Interview", value: 0 },
        { status: "Offer", value: 0 },
        { status: "Closed", value: 0 },
      ]
    });
  });
});

describe("calculatePipelineSummary", () => {
  it("uses the documented active and interview status definitions", () => {
    expect(calculatePipelineSummary([
      { status: "saved" },
      { status: "applied" },
      { status: "screening" },
      { status: "interview" },
      { status: "offer" },
      { status: "rejected" },
    ])).toEqual({ activeApplications: 3, interviews: 1 });
  });
});
