import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json, Tables } from "../supabase/database.types";
import {
  calculateDashboardSnapshot,
  DataConflictError,
  DataNotFoundError,
  type DataRepository,
} from "./repository";
import {
  MAX_AUTOMATION_RUN_ATTEMPTS,
  REMINDER_AUTOMATION_RUN_LEASE_MS,
} from "./types";
import type {
  Application,
  ApplicationEvent,
  ApplicationEventCreateInput,
  ApplicationListOptions,
  ApplicationRecord,
  ApplicationStatus,
  AutomationRule,
  AutomationRuleUpsertInput,
  AutomationReminderCreateInput,
  AutomationRun,
  AutomationRunClaimInput,
  AutomationRunCreateInput,
  AutomationRunListOptions,
  AutomationRunUpdateInput,
  BulkCreateResult,
  CreateApplicationInput,
  CvVersion,
  CvVersionCreateInput,
  CvVersionUpdateInput,
  Evaluation,
  EvaluationCreateInput,
  EvaluationEvidence,
  EvaluationUpdateInput,
  ImportBatch,
  ImportBatchCreateInput,
  ImportBatchUpdateInput,
  ImportError,
  Job,
  JobCreateInput,
  JobUpdateInput,
  JsonObject,
  Reminder,
  ReminderUpsertInput,
} from "./types";

type JobRow = Tables<"jobs">;
type ApplicationRow = Tables<"applications">;
type EventRow = Tables<"application_events">;
type CvRow = Tables<"cv_versions">;
type EvaluationRow = Tables<"evaluations">;
type ReminderRow = Tables<"reminders">;
type ImportBatchRow = Tables<"import_batches">;
type AutomationRuleRow = Tables<"automation_rules">;
type AutomationRunRow = Tables<"automation_runs">;

function json(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function stringArray(value: Json): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function evidenceArray(value: Json): EvaluationEvidence[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (
      !item ||
      Array.isArray(item) ||
      typeof item !== "object" ||
      typeof item.requirement !== "string" ||
      typeof item.score !== "number"
    ) {
      return [];
    }
    return [
      {
        requirement: item.requirement,
        cvEvidence: typeof item.cvEvidence === "string" ? item.cvEvidence : null,
        score: item.score,
      },
    ];
  });
}

function importErrors(value: Json): ImportError[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (
      !item ||
      Array.isArray(item) ||
      typeof item !== "object" ||
      typeof item.row !== "number" ||
      typeof item.message !== "string"
    ) {
      return [];
    }
    return [{ row: item.row, message: item.message }];
  });
}

function toJob(row: JobRow): Job {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    company: row.company,
    location: row.location,
    workplaceType: row.workplace_type,
    employmentType: row.employment_type,
    description: row.description,
    source: row.source,
    sourceUrl: row.source_url,
    externalId: row.external_id,
    salaryMin: row.salary_min,
    salaryMax: row.salary_max,
    salaryCurrency: row.salary_currency,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toApplication(row: ApplicationRow): Application {
  return {
    id: row.id,
    userId: row.user_id,
    jobId: row.job_id,
    status: row.status,
    cvVersionId: row.cv_version_id,
    notes: row.notes,
    appliedAt: row.applied_at,
    lastActivityAt: row.last_activity_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toEvent(row: EventRow): ApplicationEvent {
  return {
    id: row.id,
    userId: row.user_id,
    applicationId: row.application_id,
    type: row.type,
    title: row.title,
    details: row.details,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    occurredAt: row.occurred_at,
    metadata: (row.metadata ?? {}) as JsonObject,
    createdAt: row.created_at,
  };
}

function toCvVersion(row: CvRow): CvVersion {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    summary: row.summary,
    content: row.content,
    fileName: row.file_name,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    skills: row.skills,
    isDefault: row.is_default,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toEvaluation(row: EvaluationRow): Evaluation {
  return {
    id: row.id,
    userId: row.user_id,
    applicationId: row.application_id,
    jobId: row.job_id,
    cvVersionId: row.cv_version_id,
    status: row.status,
    recommendation: row.recommendation,
    overallScore: row.overall_score,
    summary: row.summary,
    strengths: stringArray(row.strengths),
    gaps: stringArray(row.gaps),
    evidence: evidenceArray(row.evidence),
    suggestedEdits: stringArray(row.suggested_edits),
    model: row.model,
    promptVersion: row.prompt_version,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

function toReminder(row: ReminderRow): Reminder {
  return {
    id: row.id,
    userId: row.user_id,
    applicationId: row.application_id,
    title: row.title,
    notes: row.notes,
    dueAt: row.due_at,
    status: row.status,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toImportBatch(row: ImportBatchRow): ImportBatch {
  return {
    id: row.id,
    userId: row.user_id,
    source: row.source,
    fileName: row.file_name,
    status: row.status,
    totalRows: row.total_rows,
    processedRows: row.processed_rows,
    succeededRows: row.succeeded_rows,
    failedRows: row.failed_rows,
    errors: importErrors(row.errors),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

function toAutomationRule(row: AutomationRuleRow): AutomationRule {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    enabled: row.enabled,
    config: (row.config ?? {}) as JsonObject,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toAutomationRun(row: AutomationRunRow): AutomationRun {
  return {
    id: row.id,
    userId: row.user_id,
    ruleId: row.rule_id,
    applicationId: row.application_id,
    type: row.type,
    status: row.status,
    idempotencyKey: row.idempotency_key,
    errorMessage: row.error_message,
    attempts: row.attempts,
    scheduledAt: row.scheduled_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toImportedApplicationRecord(value: Json, userId: string): ApplicationRecord {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new Error("Supabase returned an invalid imported application.");
  }
  const payload = value as Record<string, Json | undefined>;
  if (
    !payload.application
    || Array.isArray(payload.application)
    || typeof payload.application !== "object"
    || !payload.job
    || Array.isArray(payload.job)
    || typeof payload.job !== "object"
    || !Array.isArray(payload.events)
  ) {
    throw new Error("Supabase returned an invalid imported application.");
  }

  const application = toApplication(payload.application as unknown as ApplicationRow);
  const job = toJob(payload.job as unknown as JobRow);
  const events = (payload.events as unknown as EventRow[]).map(toEvent);
  if (
    application.userId !== userId
    || job.userId !== userId
    || application.jobId !== job.id
    || events.some((event) =>
      event.userId !== userId || event.applicationId !== application.id
    )
  ) {
    throw new Error("Supabase returned an invalid imported application owner.");
  }

  return {
    ...application,
    job,
    cvVersion: null,
    latestEvaluation: null,
    events,
  };
}

function throwQueryError(error: { message: string; code?: string } | null): void {
  if (!error) return;
  if (error.code === "23505") throw new DataConflictError(error.message);
  throw new Error(error.message);
}

function jobInsert(input: JobCreateInput, userId: string) {
  return {
    user_id: userId,
    title: input.title.trim(),
    company: input.company.trim(),
    description: input.description.trim(),
    location: input.location?.trim() || null,
    workplace_type: input.workplaceType ?? "unspecified",
    employment_type: input.employmentType ?? "unspecified",
    source: input.source ?? "manual",
    source_url: input.sourceUrl?.trim() || null,
    external_id: input.externalId?.trim() || null,
    salary_min: input.salaryMin ?? null,
    salary_max: input.salaryMax ?? null,
    salary_currency: input.salaryCurrency?.trim().toUpperCase() || null,
    published_at: input.publishedAt ?? null,
  };
}

export class SupabaseDataRepository implements DataRepository {
  readonly mode = "supabase" as const;

  constructor(
    private readonly client: SupabaseClient<Database>,
    readonly userId: string,
  ) {}

  private async loadApplicationRecords(
    rows: ApplicationRow[],
  ): Promise<ApplicationRecord[]> {
    if (rows.length === 0) return [];
    const applicationIds = rows.map((row) => row.id);
    const jobIds = [...new Set(rows.map((row) => row.job_id))];
    const cvIds = [...new Set(rows.flatMap((row) => (row.cv_version_id ? [row.cv_version_id] : [])))];

    const [jobsResult, cvsResult, evaluationsResult, eventsResult] = await Promise.all([
      this.client.from("jobs").select("*").in("id", jobIds).eq("user_id", this.userId),
      cvIds.length
        ? this.client.from("cv_versions").select("*").in("id", cvIds).eq("user_id", this.userId)
        : Promise.resolve({ data: [] as CvRow[], error: null }),
      this.client
        .from("evaluations")
        .select("*")
        .in("application_id", applicationIds)
        .eq("user_id", this.userId)
        .order("created_at", { ascending: false }),
      this.client
        .from("application_events")
        .select("*")
        .in("application_id", applicationIds)
        .eq("user_id", this.userId)
        .order("occurred_at", { ascending: false }),
    ]);
    throwQueryError(jobsResult.error);
    throwQueryError(cvsResult.error);
    throwQueryError(evaluationsResult.error);
    throwQueryError(eventsResult.error);

    const jobs = new Map((jobsResult.data ?? []).map((row) => [row.id, toJob(row)]));
    const cvs = new Map((cvsResult.data ?? []).map((row) => [row.id, toCvVersion(row)]));
    const evaluations = (evaluationsResult.data ?? []).map(toEvaluation);
    const events = (eventsResult.data ?? []).map(toEvent);

    return rows.map((row) => {
      const application = toApplication(row);
      const job = jobs.get(row.job_id);
      if (!job) throw new DataNotFoundError("Job", row.job_id);
      return {
        ...application,
        job,
        cvVersion: row.cv_version_id ? cvs.get(row.cv_version_id) ?? null : null,
        latestEvaluation:
          evaluations.find((evaluation) => evaluation.applicationId === row.id) ?? null,
        events: events.filter((event) => event.applicationId === row.id),
      };
    });
  }

  async listApplications(options: ApplicationListOptions = {}): Promise<ApplicationRecord[]> {
    let query = this.client
      .from("applications")
      .select("*")
      .eq("user_id", this.userId)
      .order("last_activity_at", { ascending: false });
    if (options.statuses?.length) query = query.in("status", options.statuses);
    const { data, error } = await query;
    throwQueryError(error);
    let records = await this.loadApplicationRecords(data ?? []);
    if (options.search?.trim()) {
      const search = options.search.trim().toLocaleLowerCase();
      records = records.filter((record) =>
        [record.job.title, record.job.company, record.job.location]
          .filter(Boolean)
          .some((value) => value!.toLocaleLowerCase().includes(search)),
      );
    }
    const offset = Math.max(0, options.offset ?? 0);
    const limit = Math.max(0, options.limit ?? records.length);
    return records.slice(offset, offset + limit);
  }

  async getApplication(id: string): Promise<ApplicationRecord | null> {
    const { data, error } = await this.client
      .from("applications")
      .select("*")
      .eq("id", id)
      .eq("user_id", this.userId)
      .maybeSingle();
    throwQueryError(error);
    return data ? (await this.loadApplicationRecords([data]))[0] : null;
  }

  async createApplication(input: CreateApplicationInput): Promise<ApplicationRecord> {
    const { data: id, error } = await this.client.rpc("create_application_with_job", {
      p_job: json(input.job),
      p_application: json(input.application ?? {}),
    });
    throwQueryError(error);
    if (!id) throw new Error("Supabase did not return the new application id.");
    const application = await this.getApplication(id);
    if (!application) throw new DataNotFoundError("Application", id);
    return application;
  }

  private async createImportedApplication(
    input: CreateApplicationInput,
    batchId: string,
  ): Promise<ApplicationRecord> {
    const { data, error } = await this.client.rpc("create_imported_application", {
      p_job: json(input.job),
      p_application: json(input.application ?? {}),
      p_batch_id: batchId,
    });
    throwQueryError(error);
    if (!data) throw new Error("Supabase did not return the imported application.");
    return toImportedApplicationRecord(data, this.userId);
  }

  async bulkCreateApplications(
    inputs: CreateApplicationInput[],
    batchId?: string,
  ): Promise<BulkCreateResult> {
    if (batchId) {
      const batches = await this.listImportBatches();
      if (!batches.some((batch) => batch.id === batchId)) {
        throw new DataNotFoundError("Import batch", batchId);
      }
      await this.updateImportBatch(batchId, {
        status: "processing",
        totalRows: inputs.length,
        processedRows: 0,
        succeededRows: 0,
        failedRows: 0,
        errors: [],
        completedAt: null,
      });
    }
    const applications: ApplicationRecord[] = [];
    const errors: ImportError[] = [];
    for (let index = 0; index < inputs.length; index += 1) {
      try {
        const application = batchId
          ? await this.createImportedApplication(inputs[index], batchId)
          : await this.createApplication(inputs[index]);
        applications.push(application);
      } catch (error) {
        errors.push({
          row: index + 1,
          message: error instanceof Error ? error.message : "Unknown import error",
        });
      }
    }
    if (batchId) {
      await this.updateImportBatch(batchId, {
        totalRows: inputs.length,
        processedRows: inputs.length,
        succeededRows: applications.length,
        failedRows: errors.length,
        errors,
        status: errors.length === 0 ? "completed" : applications.length ? "partial" : "failed",
        completedAt: new Date().toISOString(),
      });
    }
    return { applications, errors };
  }

  async updateApplicationStatus(
    id: string,
    status: ApplicationStatus,
    notes?: string | null,
  ): Promise<ApplicationRecord> {
    const { data, error } = await this.client.rpc("transition_application_status", {
      p_application_id: id,
      p_to_status: status,
      p_notes: notes,
    });
    throwQueryError(error);
    if (!data) throw new DataNotFoundError("Application", id);
    const application = await this.getApplication(data);
    if (!application) throw new DataNotFoundError("Application", data);
    return application;
  }

  async updateApplicationCv(id: string, cvVersionId: string | null): Promise<ApplicationRecord> {
    if (cvVersionId && !(await this.getCvVersion(cvVersionId))) {
      throw new DataNotFoundError("CV version", cvVersionId);
    }
    const timestamp = new Date().toISOString();
    const { error } = await this.client
      .from("applications")
      .update({ cv_version_id: cvVersionId, last_activity_at: timestamp })
      .eq("id", id)
      .eq("user_id", this.userId);
    throwQueryError(error);
    await this.createApplicationEvent({
      applicationId: id,
      type: "cv_attached",
      title: cvVersionId ? "CV attached" : "Attached CV removed",
      metadata: cvVersionId ? { cvVersionId } : {},
    });
    const application = await this.getApplication(id);
    if (!application) throw new DataNotFoundError("Application", id);
    return application;
  }

  async deleteApplication(id: string): Promise<void> {
    const { data: application, error: lookupError } = await this.client
      .from("applications")
      .select("job_id")
      .eq("id", id)
      .eq("user_id", this.userId)
      .maybeSingle();
    throwQueryError(lookupError);
    if (!application) throw new DataNotFoundError("Application", id);

    const { data: deletedJob, error: jobError } = await this.client
      .from("jobs")
      .delete()
      .eq("id", application.job_id)
      .eq("user_id", this.userId)
      .select("id")
      .maybeSingle();
    throwQueryError(jobError);
    if (!deletedJob) throw new DataNotFoundError("Application", id);
  }

  async listJobs(): Promise<Job[]> {
    const { data, error } = await this.client
      .from("jobs")
      .select("*")
      .eq("user_id", this.userId)
      .order("created_at", { ascending: false });
    throwQueryError(error);
    return (data ?? []).map(toJob);
  }

  async getJob(id: string): Promise<Job | null> {
    const { data, error } = await this.client
      .from("jobs")
      .select("*")
      .eq("id", id)
      .eq("user_id", this.userId)
      .maybeSingle();
    throwQueryError(error);
    return data ? toJob(data) : null;
  }

  async createJob(input: JobCreateInput): Promise<Job> {
    const { data, error } = await this.client
      .from("jobs")
      .insert(jobInsert(input, this.userId))
      .select("*")
      .single();
    throwQueryError(error);
    if (!data) throw new Error("Supabase did not return the new job.");
    return toJob(data);
  }

  async updateJob(id: string, input: JobUpdateInput): Promise<Job> {
    const job = await this.getJob(id);
    if (!job) throw new DataNotFoundError("Job", id);
    void input;
    throw new DataConflictError("Captured job snapshots are immutable; create a new role instead.");
  }

  async listApplicationEvents(applicationId: string): Promise<ApplicationEvent[]> {
    const { data, error } = await this.client
      .from("application_events")
      .select("*")
      .eq("application_id", applicationId)
      .eq("user_id", this.userId)
      .order("occurred_at", { ascending: false });
    throwQueryError(error);
    return (data ?? []).map(toEvent);
  }

  async createApplicationEvent(input: ApplicationEventCreateInput): Promise<ApplicationEvent> {
    const application = await this.getApplication(input.applicationId);
    if (!application) throw new DataNotFoundError("Application", input.applicationId);
    const { data, error } = await this.client
      .from("application_events")
      .insert({
        user_id: this.userId,
        application_id: input.applicationId,
        type: input.type,
        title: input.title.trim(),
        details: input.details?.trim() || null,
        from_status: input.fromStatus ?? null,
        to_status: input.toStatus ?? null,
        occurred_at: input.occurredAt,
        metadata: json(input.metadata ?? {}),
      })
      .select("*")
      .single();
    throwQueryError(error);
    if (!data) throw new Error("Supabase did not return the new application event.");
    return toEvent(data);
  }

  async listCvVersions(): Promise<CvVersion[]> {
    const { data, error } = await this.client
      .from("cv_versions")
      .select("*")
      .eq("user_id", this.userId)
      .order("is_default", { ascending: false })
      .order("updated_at", { ascending: false });
    throwQueryError(error);
    return (data ?? []).map(toCvVersion);
  }

  async getCvVersion(id: string): Promise<CvVersion | null> {
    const { data, error } = await this.client
      .from("cv_versions")
      .select("*")
      .eq("id", id)
      .eq("user_id", this.userId)
      .maybeSingle();
    throwQueryError(error);
    return data ? toCvVersion(data) : null;
  }

  async createCvVersion(input: CvVersionCreateInput): Promise<CvVersion> {
    const { data, error } = await this.client
      .from("cv_versions")
      .insert({
        user_id: this.userId,
        name: input.name.trim(),
        content: input.content.trim(),
        summary: input.summary?.trim() || null,
        file_name: input.fileName?.trim() || null,
        storage_path: input.storagePath?.trim() || null,
        mime_type: input.mimeType?.trim() || null,
        skills: input.skills ?? [],
        is_default: input.isDefault ?? false,
      })
      .select("*")
      .single();
    throwQueryError(error);
    if (!data) throw new Error("Supabase did not return the new CV version.");
    return toCvVersion(data);
  }

  async updateCvVersion(id: string, input: CvVersionUpdateInput): Promise<CvVersion> {
    if (Object.keys(input).some((key) => key !== "name" && key !== "isDefault")) {
      throw new DataConflictError("Imported CV evidence is immutable; create a new version instead.");
    }
    const update: Database["public"]["Tables"]["cv_versions"]["Update"] = {};
    if (input.name !== undefined) update.name = input.name.trim();
    if (input.isDefault !== undefined) update.is_default = input.isDefault;
    const { data, error } = await this.client
      .from("cv_versions")
      .update(update)
      .eq("id", id)
      .eq("user_id", this.userId)
      .select("*")
      .maybeSingle();
    throwQueryError(error);
    if (!data) throw new DataNotFoundError("CV version", id);
    return toCvVersion(data);
  }

  async deleteCvVersion(id: string): Promise<void> {
    const { data, error } = await this.client
      .from("cv_versions")
      .delete()
      .eq("id", id)
      .eq("user_id", this.userId)
      .select("id")
      .maybeSingle();
    throwQueryError(error);
    if (!data) throw new DataNotFoundError("CV version", id);
  }

  async listEvaluations(jobId?: string): Promise<Evaluation[]> {
    let query = this.client
      .from("evaluations")
      .select("*")
      .eq("user_id", this.userId)
      .order("created_at", { ascending: false });
    if (jobId) query = query.eq("job_id", jobId);
    const { data, error } = await query;
    throwQueryError(error);
    return (data ?? []).map(toEvaluation);
  }

  async getEvaluation(id: string): Promise<Evaluation | null> {
    const { data, error } = await this.client
      .from("evaluations")
      .select("*")
      .eq("id", id)
      .eq("user_id", this.userId)
      .maybeSingle();
    throwQueryError(error);
    return data ? toEvaluation(data) : null;
  }

  async createEvaluation(input: EvaluationCreateInput): Promise<Evaluation> {
    const application = await this.getApplication(input.applicationId);
    if (!application) throw new DataNotFoundError("Application", input.applicationId);
    if (input.jobId && input.jobId !== application.jobId) {
      throw new DataConflictError("Evaluation job does not belong to the application.");
    }
    const status = input.status ?? (input.overallScore !== undefined ? "completed" : "pending");
    const { data, error } = await this.client
      .from("evaluations")
      .insert({
        user_id: this.userId,
        application_id: application.id,
        job_id: application.jobId,
        cv_version_id: input.cvVersionId ?? application.cvVersionId,
        status,
        recommendation: input.recommendation ?? null,
        overall_score: input.overallScore ?? null,
        summary: input.summary?.trim() || null,
        strengths: json(input.strengths ?? []),
        gaps: json(input.gaps ?? []),
        evidence: json(input.evidence ?? []),
        suggested_edits: json(input.suggestedEdits ?? []),
        model: input.model?.trim() || null,
        prompt_version: input.promptVersion?.trim() || null,
        error_message: input.errorMessage?.trim() || null,
        completed_at:
          input.completedAt ?? (status === "completed" ? new Date().toISOString() : null),
      })
      .select("*")
      .single();
    throwQueryError(error);
    if (!data) throw new Error("Supabase did not return the new evaluation.");
    return toEvaluation(data);
  }

  async updateEvaluation(id: string, input: EvaluationUpdateInput): Promise<Evaluation> {
    const update: Database["public"]["Tables"]["evaluations"]["Update"] = {};
    if (input.cvVersionId !== undefined) update.cv_version_id = input.cvVersionId;
    if (input.status !== undefined) update.status = input.status;
    if (input.recommendation !== undefined) update.recommendation = input.recommendation;
    if (input.overallScore !== undefined) update.overall_score = input.overallScore;
    if (input.summary !== undefined) update.summary = input.summary?.trim() || null;
    if (input.strengths !== undefined) update.strengths = json(input.strengths);
    if (input.gaps !== undefined) update.gaps = json(input.gaps);
    if (input.evidence !== undefined) update.evidence = json(input.evidence);
    if (input.suggestedEdits !== undefined) update.suggested_edits = json(input.suggestedEdits);
    if (input.model !== undefined) update.model = input.model?.trim() || null;
    if (input.promptVersion !== undefined) {
      update.prompt_version = input.promptVersion?.trim() || null;
    }
    if (input.errorMessage !== undefined) update.error_message = input.errorMessage?.trim() || null;
    if (input.completedAt !== undefined) update.completed_at = input.completedAt;
    const { data, error } = await this.client
      .from("evaluations")
      .update(update)
      .eq("id", id)
      .eq("user_id", this.userId)
      .select("*")
      .maybeSingle();
    throwQueryError(error);
    if (!data) throw new DataNotFoundError("Evaluation", id);
    return toEvaluation(data);
  }

  async listReminders(includeCompleted = false): Promise<Reminder[]> {
    let query = this.client
      .from("reminders")
      .select("*")
      .eq("user_id", this.userId)
      .order("due_at", { ascending: true });
    if (!includeCompleted) query = query.eq("status", "pending");
    const { data, error } = await query;
    throwQueryError(error);
    return (data ?? []).map(toReminder);
  }

  private async getReminder(id: string): Promise<Reminder | null> {
    const { data, error } = await this.client
      .from("reminders")
      .select("*")
      .eq("id", id)
      .eq("user_id", this.userId)
      .maybeSingle();
    throwQueryError(error);
    return data ? toReminder(data) : null;
  }

  async upsertReminder(input: ReminderUpsertInput): Promise<Reminder> {
    const payload: Database["public"]["Tables"]["reminders"]["Insert"] = {
      ...(input.id ? { id: input.id } : {}),
      user_id: this.userId,
      application_id: input.applicationId ?? null,
      title: input.title.trim(),
      notes: input.notes?.trim() || null,
      due_at: input.dueAt,
      status: input.status ?? "pending",
      completed_at: input.status === "completed" ? new Date().toISOString() : null,
    };
    const { data, error } = await this.client
      .from("reminders")
      .upsert(payload)
      .select("*")
      .single();
    throwQueryError(error);
    if (!data) throw new Error("Supabase did not return the reminder.");
    return toReminder(data);
  }

  async completeReminder(id: string): Promise<Reminder> {
    const { data, error } = await this.client
      .from("reminders")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", this.userId)
      .eq("status", "pending")
      .select("*")
      .maybeSingle();
    throwQueryError(error);
    if (!data) return this.getTerminalReminder(id, "completed");
    return toReminder(data);
  }

  async dismissReminder(id: string): Promise<Reminder> {
    const { data, error } = await this.client
      .from("reminders")
      .update({ status: "dismissed", completed_at: null })
      .eq("id", id)
      .eq("user_id", this.userId)
      .eq("status", "pending")
      .select("*")
      .maybeSingle();
    throwQueryError(error);
    if (!data) return this.getTerminalReminder(id, "dismissed");
    return toReminder(data);
  }

  async ensureAutomationReminder(
    runId: string,
    input: AutomationReminderCreateInput,
  ): Promise<Reminder> {
    const run = await this.getAutomationRun(runId);
    if (!run) throw new DataNotFoundError("Automation run", runId);
    const existing = await this.getReminder(runId);
    if (existing) {
      if (existing.applicationId !== input.applicationId) {
        throw new DataConflictError("The automation reminder identity is already in use.");
      }
      return existing;
    }
    if (run.type !== "follow_up" && run.type !== "interview_prep") {
      throw new DataConflictError("This automation run does not create a reminder.");
    }
    if (run.status !== "running") {
      throw new DataConflictError("The automation run must be running before creating a reminder.");
    }
    if (run.applicationId !== input.applicationId) {
      throw new DataConflictError("The reminder application does not match its automation run.");
    }
    if (!input.title.trim()) throw new DataConflictError("A reminder requires a title.");
    const payload: Database["public"]["Tables"]["reminders"]["Insert"] = {
      id: runId,
      user_id: this.userId,
      application_id: input.applicationId,
      title: input.title.trim(),
      notes: input.notes?.trim() || null,
      due_at: input.dueAt,
      status: "pending",
      completed_at: null,
    };
    const { data, error } = await this.client
      .from("reminders")
      .insert(payload)
      .select("*")
      .maybeSingle();
    if (error?.code === "23505") {
      const concurrent = await this.getReminder(runId);
      if (concurrent?.applicationId === input.applicationId) return concurrent;
    }
    throwQueryError(error);
    if (!data) throw new Error("Supabase did not return the automation reminder.");
    return toReminder(data);
  }

  private async getTerminalReminder(
    id: string,
    status: "completed" | "dismissed",
  ): Promise<Reminder> {
    const { data, error } = await this.client
      .from("reminders")
      .select("*")
      .eq("id", id)
      .eq("user_id", this.userId)
      .eq("status", status)
      .maybeSingle();
    throwQueryError(error);
    if (!data) throw new DataNotFoundError("Reminder", id);
    return toReminder(data);
  }

  async listImportBatches(): Promise<ImportBatch[]> {
    const { data, error } = await this.client
      .from("import_batches")
      .select("*")
      .eq("user_id", this.userId)
      .order("created_at", { ascending: false });
    throwQueryError(error);
    return (data ?? []).map(toImportBatch);
  }

  async createImportBatch(input: ImportBatchCreateInput): Promise<ImportBatch> {
    const { data, error } = await this.client
      .from("import_batches")
      .insert({
        user_id: this.userId,
        source: input.source,
        file_name: input.fileName?.trim() || null,
        total_rows: input.totalRows ?? 0,
        status: input.status ?? "pending",
      })
      .select("*")
      .single();
    throwQueryError(error);
    if (!data) throw new Error("Supabase did not return the import batch.");
    return toImportBatch(data);
  }

  async updateImportBatch(id: string, input: ImportBatchUpdateInput): Promise<ImportBatch> {
    const update: Database["public"]["Tables"]["import_batches"]["Update"] = {};
    if (input.status !== undefined) update.status = input.status;
    if (input.totalRows !== undefined) update.total_rows = input.totalRows;
    if (input.processedRows !== undefined) update.processed_rows = input.processedRows;
    if (input.succeededRows !== undefined) update.succeeded_rows = input.succeededRows;
    if (input.failedRows !== undefined) update.failed_rows = input.failedRows;
    if (input.errors !== undefined) update.errors = json(input.errors);
    if (input.completedAt !== undefined) update.completed_at = input.completedAt;
    const { data, error } = await this.client
      .from("import_batches")
      .update(update)
      .eq("id", id)
      .eq("user_id", this.userId)
      .select("*")
      .maybeSingle();
    throwQueryError(error);
    if (!data) throw new DataNotFoundError("Import batch", id);
    return toImportBatch(data);
  }

  async deleteImportBatch(id: string): Promise<void> {
    const { data, error } = await this.client
      .from("import_batches")
      .delete()
      .eq("id", id)
      .eq("user_id", this.userId)
      .select("id")
      .maybeSingle();
    throwQueryError(error);
    if (!data) throw new DataNotFoundError("Import batch", id);
  }

  async listAutomationRules(): Promise<AutomationRule[]> {
    const { data, error } = await this.client
      .from("automation_rules")
      .select("*")
      .eq("user_id", this.userId)
      .order("type", { ascending: true });
    throwQueryError(error);
    return (data ?? []).map(toAutomationRule);
  }

  async upsertAutomationRule(input: AutomationRuleUpsertInput): Promise<AutomationRule> {
    const existing = input.id
      ? (await this.listAutomationRules()).find((rule) => rule.id === input.id)
      : (await this.listAutomationRules()).find((rule) => rule.type === input.type);
    if (input.id && !existing) throw new DataNotFoundError("Automation rule", input.id);
    if (existing && existing.type !== input.type) {
      throw new DataConflictError("An automation rule's type cannot be changed.");
    }
    if (existing) {
      const { data, error } = await this.client
        .from("automation_rules")
        .update({ enabled: input.enabled, config: json(input.config ?? existing.config) })
        .eq("id", existing.id)
        .eq("user_id", this.userId)
        .select("*")
        .single();
      throwQueryError(error);
      if (!data) throw new DataNotFoundError("Automation rule", existing.id);
      return toAutomationRule(data);
    }
    const { data, error } = await this.client
      .from("automation_rules")
      .insert({
        user_id: this.userId,
        type: input.type,
        enabled: input.enabled,
        config: json(input.config ?? {}),
      })
      .select("*")
      .single();
    throwQueryError(error);
    if (!data) throw new Error("Supabase did not return the automation rule.");
    return toAutomationRule(data);
  }

  async listAutomationRuns(options: AutomationRunListOptions = {}): Promise<AutomationRun[]> {
    let query = this.client
      .from("automation_runs")
      .select("*")
      .eq("user_id", this.userId)
      .order("created_at", { ascending: false });
    if (options.applicationId) query = query.eq("application_id", options.applicationId);
    if (options.statuses?.length) query = query.in("status", options.statuses);
    if (options.limit !== undefined) query = query.limit(Math.max(0, options.limit));
    const { data, error } = await query;
    throwQueryError(error);
    return (data ?? []).map(toAutomationRun);
  }

  async getAutomationRun(id: string): Promise<AutomationRun | null> {
    const { data, error } = await this.client
      .from("automation_runs")
      .select("*")
      .eq("id", id)
      .eq("user_id", this.userId)
      .maybeSingle();
    throwQueryError(error);
    return data ? toAutomationRun(data) : null;
  }

  async getAutomationRunByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<AutomationRun | null> {
    const { data, error } = await this.client
      .from("automation_runs")
      .select("*")
      .eq("user_id", this.userId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    throwQueryError(error);
    return data ? toAutomationRun(data) : null;
  }

  async createAutomationRun(input: AutomationRunCreateInput): Promise<AutomationRun> {
    const timestamp = new Date().toISOString();
    const status = input.status ?? "pending";
    const terminal = ["succeeded", "failed", "cancelled"].includes(status);
    const { data, error } = await this.client
      .from("automation_runs")
      .insert({
        user_id: this.userId,
        rule_id: input.ruleId ?? null,
        application_id: input.applicationId ?? null,
        type: input.type,
        status,
        idempotency_key: input.idempotencyKey.trim(),
        error_message: input.errorMessage?.trim() || null,
        attempts: input.attempts ?? 0,
        scheduled_at: input.scheduledAt ?? timestamp,
        started_at: input.startedAt ?? (status === "running" ? timestamp : null),
        completed_at: input.completedAt ?? (terminal ? timestamp : null),
      })
      .select("*")
      .single();
    throwQueryError(error);
    if (!data) throw new Error("Supabase did not return the automation run.");
    return toAutomationRun(data);
  }

  async claimAutomationRun(
    id: string,
    input: AutomationRunClaimInput,
  ): Promise<AutomationRun | null> {
    if (!Number.isSafeInteger(input.expectedAttempts) || input.expectedAttempts < 0) {
      throw new DataConflictError("Expected attempts must be a non-negative integer.");
    }
    const startedTimestamp = Date.parse(input.startedAt ?? new Date().toISOString());
    if (!Number.isFinite(startedTimestamp)) {
      throw new DataConflictError("A valid automation start time is required.");
    }
    const startedAt = new Date(startedTimestamp).toISOString();
    const leaseCutoff = new Date(
      startedTimestamp - REMINDER_AUTOMATION_RUN_LEASE_MS,
    ).toISOString();
    const { data, error } = await this.client
      .from("automation_runs")
      .update({
        status: "running",
        attempts: input.expectedAttempts + 1,
        started_at: startedAt,
        completed_at: null,
        error_message: null,
      })
      .eq("id", id)
      .eq("user_id", this.userId)
      .eq("attempts", input.expectedAttempts)
      .lt("attempts", MAX_AUTOMATION_RUN_ATTEMPTS)
      .lte("scheduled_at", startedAt)
      .or(
        `status.in.(pending,failed),and(status.eq.running,type.in.(follow_up,interview_prep),started_at.is.null),and(status.eq.running,type.in.(follow_up,interview_prep),started_at.lte.${leaseCutoff})`,
      )
      .select("*")
      .maybeSingle();
    throwQueryError(error);
    return data ? toAutomationRun(data) : null;
  }

  async cancelAutomationRun(id: string): Promise<AutomationRun> {
    const timestamp = new Date().toISOString();
    const { data, error } = await this.client
      .from("automation_runs")
      .update({ status: "cancelled", completed_at: timestamp })
      .eq("id", id)
      .eq("user_id", this.userId)
      .in("status", ["pending", "failed"])
      .lt("attempts", MAX_AUTOMATION_RUN_ATTEMPTS)
      .select("*")
      .maybeSingle();
    throwQueryError(error);
    if (data) return toAutomationRun(data);
    const existing = await this.getAutomationRun(id);
    if (!existing) throw new DataNotFoundError("Automation run", id);
    if (existing.status === "cancelled") return existing;
    throw new DataConflictError("This automation run cannot be cancelled.");
  }

  async updateAutomationRun(
    id: string,
    input: AutomationRunUpdateInput,
  ): Promise<AutomationRun> {
    const update: Database["public"]["Tables"]["automation_runs"]["Update"] = {};
    const timestamp = new Date().toISOString();
    if (input.status !== undefined) {
      update.status = input.status;
      if (input.status === "running" && input.startedAt === undefined) {
        update.started_at = timestamp;
      }
      if (["succeeded", "failed", "cancelled"].includes(input.status)) {
        update.completed_at = input.completedAt ?? timestamp;
      } else {
        update.completed_at = null;
      }
    }
    if (input.errorMessage !== undefined) update.error_message = input.errorMessage?.trim() || null;
    if (input.attempts !== undefined) update.attempts = input.attempts;
    if (input.scheduledAt !== undefined) update.scheduled_at = input.scheduledAt;
    if (input.startedAt !== undefined) update.started_at = input.startedAt;
    if (input.completedAt !== undefined) update.completed_at = input.completedAt;
    const { data, error } = await this.client
      .from("automation_runs")
      .update(update)
      .eq("id", id)
      .eq("user_id", this.userId)
      .select("*")
      .maybeSingle();
    throwQueryError(error);
    if (!data) throw new DataNotFoundError("Automation run", id);
    return toAutomationRun(data);
  }

  async getDashboardSnapshot() {
    const [applications, reminders] = await Promise.all([
      this.listApplications(),
      this.listReminders(),
    ]);
    return calculateDashboardSnapshot(applications, reminders);
  }
}
