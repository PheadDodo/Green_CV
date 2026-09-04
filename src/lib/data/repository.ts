import type {
  AutomationRule,
  AutomationRuleUpsertInput,
  AutomationReminderCreateInput,
  AutomationRun,
  AutomationRunClaimInput,
  AutomationRunCreateInput,
  AutomationRunListOptions,
  AutomationRunUpdateInput,
  ApplicationEvent,
  ApplicationEventCreateInput,
  ApplicationListOptions,
  ApplicationRecord,
  ApplicationStatus,
  BulkCreateResult,
  CreateApplicationInput,
  CvVersion,
  CvVersionCreateInput,
  CvVersionUpdateInput,
  DashboardSnapshot,
  Evaluation,
  EvaluationCreateInput,
  EvaluationUpdateInput,
  ImportBatch,
  ImportBatchCreateInput,
  ImportBatchUpdateInput,
  Job,
  JobCreateInput,
  JobUpdateInput,
  Reminder,
  ReminderUpsertInput,
} from "./types";

/**
 * User-scoped persistence contract. Implementations must never return records
 * owned by a different user, even when the caller supplies a foreign id.
 */
export interface DataRepository {
  readonly mode: "supabase" | "local";
  readonly userId: string;

  listApplications(options?: ApplicationListOptions): Promise<ApplicationRecord[]>;
  getApplication(id: string): Promise<ApplicationRecord | null>;
  createApplication(input: CreateApplicationInput): Promise<ApplicationRecord>;
  bulkCreateApplications(
    inputs: CreateApplicationInput[],
    batchId?: string,
  ): Promise<BulkCreateResult>;
  updateApplicationStatus(
    id: string,
    status: ApplicationStatus,
    notes?: string | null,
  ): Promise<ApplicationRecord>;
  updateApplicationCv(id: string, cvVersionId: string | null): Promise<ApplicationRecord>;
  deleteApplication(id: string): Promise<void>;

  listJobs(): Promise<Job[]>;
  getJob(id: string): Promise<Job | null>;
  createJob(input: JobCreateInput): Promise<Job>;
  updateJob(id: string, input: JobUpdateInput): Promise<Job>;

  listApplicationEvents(applicationId: string): Promise<ApplicationEvent[]>;
  createApplicationEvent(input: ApplicationEventCreateInput): Promise<ApplicationEvent>;

  listCvVersions(): Promise<CvVersion[]>;
  getCvVersion(id: string): Promise<CvVersion | null>;
  createCvVersion(input: CvVersionCreateInput): Promise<CvVersion>;
  updateCvVersion(id: string, input: CvVersionUpdateInput): Promise<CvVersion>;
  deleteCvVersion(id: string): Promise<void>;

  listEvaluations(jobId?: string): Promise<Evaluation[]>;
  getEvaluation(id: string): Promise<Evaluation | null>;
  createEvaluation(input: EvaluationCreateInput): Promise<Evaluation>;
  updateEvaluation(id: string, input: EvaluationUpdateInput): Promise<Evaluation>;

  listReminders(includeCompleted?: boolean): Promise<Reminder[]>;
  upsertReminder(input: ReminderUpsertInput): Promise<Reminder>;
  completeReminder(id: string): Promise<Reminder>;
  dismissReminder(id: string): Promise<Reminder>;
  ensureAutomationReminder(
    runId: string,
    input: AutomationReminderCreateInput,
  ): Promise<Reminder>;

  listImportBatches(): Promise<ImportBatch[]>;
  createImportBatch(input: ImportBatchCreateInput): Promise<ImportBatch>;
  updateImportBatch(id: string, input: ImportBatchUpdateInput): Promise<ImportBatch>;
  deleteImportBatch(id: string): Promise<void>;

  listAutomationRules(): Promise<AutomationRule[]>;
  upsertAutomationRule(input: AutomationRuleUpsertInput): Promise<AutomationRule>;
  listAutomationRuns(options?: AutomationRunListOptions): Promise<AutomationRun[]>;
  getAutomationRun(id: string): Promise<AutomationRun | null>;
  getAutomationRunByIdempotencyKey(idempotencyKey: string): Promise<AutomationRun | null>;
  createAutomationRun(input: AutomationRunCreateInput): Promise<AutomationRun>;
  claimAutomationRun(
    id: string,
    input: AutomationRunClaimInput,
  ): Promise<AutomationRun | null>;
  cancelAutomationRun(id: string): Promise<AutomationRun>;
  updateAutomationRun(id: string, input: AutomationRunUpdateInput): Promise<AutomationRun>;

  getDashboardSnapshot(): Promise<DashboardSnapshot>;
}

export class DataNotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} not found: ${id}`);
    this.name = "DataNotFoundError";
  }
}

export class DataConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataConflictError";
  }
}

export class DataConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataConfigurationError";
  }
}

export function calculateDashboardSnapshot(
  applications: ApplicationRecord[],
  reminders: Reminder[],
): DashboardSnapshot {
  const activeStatuses = new Set<ApplicationStatus>([
    "saved",
    "applied",
    "screening",
    "interview",
    "offer",
  ]);
  const applied = applications.filter((item) => item.status !== "saved" && item.status !== "archived");
  const replies = applied.filter((item) =>
    ["screening", "interview", "offer", "rejected"].includes(item.status),
  );
  const scores = applications
    .map((item) => item.latestEvaluation?.overallScore)
    .filter((score): score is number => score !== null && score !== undefined);

  return {
    applications,
    reminders,
    activeCount: applications.filter((item) => activeStatuses.has(item.status)).length,
    responseRate: applied.length === 0 ? 0 : Math.round((replies.length / applied.length) * 100),
    interviewCount: applications.filter((item) => item.status === "interview").length,
    averageFit:
      scores.length === 0
        ? null
        : Math.round(scores.reduce((total, score) => total + score, 0) / scores.length),
  };
}
