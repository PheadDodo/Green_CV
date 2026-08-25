export const APPLICATION_STATUSES = [
  "saved",
  "applied",
  "screening",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
  "archived",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const WORKPLACE_TYPES = ["remote", "hybrid", "onsite", "unspecified"] as const;
export type WorkplaceType = (typeof WORKPLACE_TYPES)[number];

export const EMPLOYMENT_TYPES = [
  "full_time",
  "part_time",
  "contract",
  "internship",
  "temporary",
  "unspecified",
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const JOB_SOURCES = ["manual", "url", "linkedin", "indeed", "csv", "api"] as const;
export type JobSource = (typeof JOB_SOURCES)[number];

export const APPLICATION_EVENT_TYPES = [
  "created",
  "status_changed",
  "note",
  "cv_attached",
  "evaluation_completed",
  "interview_scheduled",
  "follow_up",
  "imported",
] as const;
export type ApplicationEventType = (typeof APPLICATION_EVENT_TYPES)[number];

export const EVALUATION_STATUSES = ["pending", "running", "completed", "failed"] as const;
export type EvaluationStatus = (typeof EVALUATION_STATUSES)[number];

export const EVALUATION_RECOMMENDATIONS = ["apply", "consider", "skip"] as const;
export type EvaluationRecommendation = (typeof EVALUATION_RECOMMENDATIONS)[number];

export const REMINDER_STATUSES = ["pending", "completed", "dismissed"] as const;
export type ReminderStatus = (typeof REMINDER_STATUSES)[number];

export const IMPORT_BATCH_STATUSES = [
  "pending",
  "processing",
  "completed",
  "partial",
  "failed",
] as const;
export type ImportBatchStatus = (typeof IMPORT_BATCH_STATUSES)[number];

export const AUTOMATION_RULE_TYPES = ["auto_evaluate", "follow_up", "interview_prep"] as const;
export type AutomationRuleType = (typeof AUTOMATION_RULE_TYPES)[number];

export const AUTOMATION_RUN_STATUSES = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "cancelled",
] as const;
export type AutomationRunStatus = (typeof AUTOMATION_RUN_STATUSES)[number];

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export interface Job {
  id: string;
  userId: string;
  title: string;
  company: string;
  location: string | null;
  workplaceType: WorkplaceType;
  employmentType: EmploymentType;
  description: string;
  source: JobSource;
  sourceUrl: string | null;
  externalId: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Application {
  id: string;
  userId: string;
  jobId: string;
  status: ApplicationStatus;
  cvVersionId: string | null;
  notes: string | null;
  appliedAt: string | null;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationEvent {
  id: string;
  userId: string;
  applicationId: string;
  type: ApplicationEventType;
  title: string;
  details: string | null;
  fromStatus: ApplicationStatus | null;
  toStatus: ApplicationStatus | null;
  occurredAt: string;
  metadata: JsonObject;
  createdAt: string;
}

export interface CvVersion {
  id: string;
  userId: string;
  name: string;
  summary: string | null;
  content: string;
  fileName: string | null;
  storagePath: string | null;
  mimeType: string | null;
  skills: string[];
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EvaluationEvidence {
  requirement: string;
  cvEvidence: string | null;
  score: number;
}

export interface Evaluation {
  id: string;
  userId: string;
  applicationId: string;
  jobId: string;
  cvVersionId: string | null;
  status: EvaluationStatus;
  recommendation: EvaluationRecommendation | null;
  overallScore: number | null;
  summary: string | null;
  strengths: string[];
  gaps: string[];
  evidence: EvaluationEvidence[];
  suggestedEdits: string[];
  model: string | null;
  promptVersion: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface Reminder {
  id: string;
  userId: string;
  applicationId: string | null;
  title: string;
  notes: string | null;
  dueAt: string;
  status: ReminderStatus;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ImportError {
  row: number;
  message: string;
  value?: JsonValue;
}

export interface ImportBatch {
  id: string;
  userId: string;
  source: JobSource;
  fileName: string | null;
  status: ImportBatchStatus;
  totalRows: number;
  processedRows: number;
  succeededRows: number;
  failedRows: number;
  errors: ImportError[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface AutomationRule {
  id: string;
  userId: string;
  type: AutomationRuleType;
  enabled: boolean;
  config: JsonObject;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationRun {
  id: string;
  userId: string;
  ruleId: string | null;
  applicationId: string | null;
  type: AutomationRuleType;
  status: AutomationRunStatus;
  idempotencyKey: string;
  errorMessage: string | null;
  attempts: number;
  scheduledAt: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationRecord extends Application {
  job: Job;
  cvVersion: CvVersion | null;
  latestEvaluation: Evaluation | null;
  events: ApplicationEvent[];
}

export interface JobCreateInput {
  title: string;
  company: string;
  description: string;
  location?: string | null;
  workplaceType?: WorkplaceType;
  employmentType?: EmploymentType;
  source?: JobSource;
  sourceUrl?: string | null;
  externalId?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  publishedAt?: string | null;
}

export type JobUpdateInput = Partial<JobCreateInput>;

export interface ApplicationDraftInput {
  status?: ApplicationStatus;
  cvVersionId?: string | null;
  notes?: string | null;
  appliedAt?: string | null;
}

export interface CreateApplicationInput {
  job: JobCreateInput;
  application?: ApplicationDraftInput;
}

export interface ApplicationListOptions {
  statuses?: ApplicationStatus[];
  search?: string;
  limit?: number;
  offset?: number;
}

export interface CvVersionCreateInput {
  name: string;
  content: string;
  summary?: string | null;
  fileName?: string | null;
  storagePath?: string | null;
  mimeType?: string | null;
  skills?: string[];
  isDefault?: boolean;
}

export type CvVersionUpdateInput = Partial<Pick<CvVersionCreateInput, "name" | "isDefault">>;

export interface ApplicationEventCreateInput {
  applicationId: string;
  type: ApplicationEventType;
  title: string;
  details?: string | null;
  fromStatus?: ApplicationStatus | null;
  toStatus?: ApplicationStatus | null;
  occurredAt?: string;
  metadata?: JsonObject;
}

export interface EvaluationCreateInput {
  applicationId: string;
  jobId?: string;
  cvVersionId?: string | null;
  status?: EvaluationStatus;
  recommendation?: EvaluationRecommendation | null;
  overallScore?: number | null;
  summary?: string | null;
  strengths?: string[];
  gaps?: string[];
  evidence?: EvaluationEvidence[];
  suggestedEdits?: string[];
  model?: string | null;
  promptVersion?: string | null;
  errorMessage?: string | null;
  completedAt?: string | null;
}

export type EvaluationUpdateInput = Partial<Omit<EvaluationCreateInput, "applicationId" | "jobId">>;

export interface ReminderUpsertInput {
  id?: string;
  applicationId?: string | null;
  title: string;
  notes?: string | null;
  dueAt: string;
  status?: ReminderStatus;
}

export interface ImportBatchCreateInput {
  source: JobSource;
  fileName?: string | null;
  totalRows?: number;
  status?: ImportBatchStatus;
}

export type ImportBatchUpdateInput = Partial<
  Pick<
    ImportBatch,
    | "status"
    | "totalRows"
    | "processedRows"
    | "succeededRows"
    | "failedRows"
    | "errors"
    | "completedAt"
  >
>;

export interface AutomationRuleUpsertInput {
  id?: string;
  type: AutomationRuleType;
  enabled: boolean;
  config?: JsonObject;
}

export interface AutomationRunCreateInput {
  ruleId?: string | null;
  applicationId?: string | null;
  type: AutomationRuleType;
  status?: AutomationRunStatus;
  idempotencyKey: string;
  errorMessage?: string | null;
  attempts?: number;
  scheduledAt?: string;
  startedAt?: string | null;
  completedAt?: string | null;
}

export type AutomationRunUpdateInput = Partial<
  Pick<
    AutomationRun,
    "status" | "errorMessage" | "attempts" | "scheduledAt" | "startedAt" | "completedAt"
  >
>;

export interface AutomationRunListOptions {
  applicationId?: string;
  statuses?: AutomationRunStatus[];
  limit?: number;
}

export interface BulkCreateResult {
  applications: ApplicationRecord[];
  errors: ImportError[];
}

export interface DashboardSnapshot {
  applications: ApplicationRecord[];
  reminders: Reminder[];
  activeCount: number;
  responseRate: number;
  interviewCount: number;
  averageFit: number | null;
}
