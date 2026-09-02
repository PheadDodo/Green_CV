export const ACTIVE_STATUSES = new Set(["applied", "screening", "interview"]);

export type MetricEvent = {
  eventType: string;
  occurredAt: string;
  toStatus?: string | null;
};

export type MetricApplication = {
  id: string;
  status: string;
  discoveredAt: string;
  appliedAt?: string | null;
  latestEvaluationScore?: number | null;
  events: MetricEvent[];
};

export type DashboardStatusDatum = {
  status: "Saved" | "Applied" | "Screening" | "Interview" | "Offer" | "Closed";
  value: number;
};

export type DashboardMetrics = {
  activeApplications: number;
  responseRate: number;
  interviews: number;
  averageFit: number;
  funnel: Array<{ stage: "Discovered" | "Applied" | "Responded" | "Interview" | "Offer"; value: number }>;
  statusBreakdown: DashboardStatusDatum[];
};

export function calculatePipelineSummary(applications: Array<{ status: string }>) {
  return {
    activeApplications: applications.filter(application => ACTIVE_STATUSES.has(application.status)).length,
    interviews: applications.filter(application => application.status === "interview").length,
  };
}

const RESPONSE_EVENTS = new Set(["response_received", "screening_scheduled", "interview_scheduled"]);
const CLOSED_STATUSES = new Set(["rejected", "withdrawn", "archived"]);

function inRange(value: string | null | undefined, from: number, to: number) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp >= from && timestamp <= to;
}

function hasEvent(application: MetricApplication, predicate: (event: MetricEvent) => boolean, from: number, to: number) {
  return application.events.some(event => inRange(event.occurredAt, from, to) && predicate(event));
}

export function calculateDashboardMetrics(
  applications: MetricApplication[],
  options: { now?: Date; rangeDays?: number } = {}
): DashboardMetrics {
  const now = options.now ?? new Date();
  const rangeDays = options.rangeDays ?? 30;
  const to = now.getTime();
  const from = to - rangeDays * 24 * 60 * 60 * 1000;

  const active = applications.filter(application => ACTIVE_STATUSES.has(application.status));
  const submittedCohort = applications.filter(application => inRange(application.appliedAt, from, to));
  const respondedCohort = submittedCohort.filter(application =>
    application.events.some(event => RESPONSE_EVENTS.has(event.eventType) || ["screening", "interview", "offer"].includes(event.toStatus ?? ""))
  );
  const interviews = applications.filter(application =>
    hasEvent(application, event => event.eventType === "interview_scheduled" || event.toStatus === "interview", from, to)
  ).length;
  const scores = active
    .map(application => application.latestEvaluationScore)
    .filter((score): score is number => typeof score === "number" && Number.isFinite(score));

  const reached = (application: MetricApplication, stage: string) => {
    if (stage === "discovered") return inRange(application.discoveredAt, from, to);
    if (stage === "applied") return inRange(application.appliedAt, from, to) || hasEvent(application, event => event.toStatus === "applied", from, to);
    if (stage === "responded") return hasEvent(application, event => RESPONSE_EVENTS.has(event.eventType) || ["screening", "interview", "offer"].includes(event.toStatus ?? ""), from, to);
    return hasEvent(application, event => event.toStatus === stage || event.eventType === `${stage}_scheduled`, from, to);
  };

  return {
    activeApplications: active.length,
    responseRate: submittedCohort.length ? Math.round((respondedCohort.length / submittedCohort.length) * 100) : 0,
    interviews,
    averageFit: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0,
    funnel: [
      { stage: "Discovered", value: applications.filter(application => reached(application, "discovered")).length },
      { stage: "Applied", value: applications.filter(application => reached(application, "applied")).length },
      { stage: "Responded", value: applications.filter(application => reached(application, "responded")).length },
      { stage: "Interview", value: applications.filter(application => reached(application, "interview")).length },
      { stage: "Offer", value: applications.filter(application => reached(application, "offer")).length }
    ],
    statusBreakdown: [
      { status: "Saved", value: applications.filter(application => application.status === "saved").length },
      { status: "Applied", value: applications.filter(application => application.status === "applied").length },
      { status: "Screening", value: applications.filter(application => application.status === "screening").length },
      { status: "Interview", value: applications.filter(application => application.status === "interview").length },
      { status: "Offer", value: applications.filter(application => application.status === "offer").length },
      { status: "Closed", value: applications.filter(application => CLOSED_STATUSES.has(application.status)).length },
    ]
  };
}
