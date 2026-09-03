import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  calculateDashboardSnapshot,
  DataConflictError,
  DataNotFoundError,
  type DataRepository,
} from "./repository";
import {
  createSeedData,
  DATA_STORE_SCHEMA_VERSION,
  DEMO_USER_ID,
  type DataStoreDocument,
} from "./seed";
import type {
  Application,
  ApplicationEvent,
  ApplicationEventCreateInput,
  ApplicationListOptions,
  ApplicationRecord,
  ApplicationStatus,
  AutomationRule,
  AutomationRuleUpsertInput,
  AutomationRun,
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
  EvaluationUpdateInput,
  ImportBatch,
  ImportBatchCreateInput,
  ImportBatchUpdateInput,
  ImportError,
  Job,
  JobCreateInput,
  JobUpdateInput,
  Reminder,
  ReminderUpsertInput,
} from "./types";

const DEFAULT_STORE_PATH = path.join(process.cwd(), ".data", "jobs-summary.json");
let mutationQueue: Promise<void> = Promise.resolve();
const initializationByPath = new Map<string, Promise<DataStoreDocument>>();

function newId(): string {
  return globalThis.crypto.randomUUID();
}

function now(): string {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function normalizeDocument(value: unknown, seedUserId: string): DataStoreDocument {
  if (typeof value !== "object" || value === null || !("schemaVersion" in value)) {
    throw new DataConflictError(
      `Unsupported local data schema. Expected version ${DATA_STORE_SCHEMA_VERSION}.`,
    );
  }
  const record = value as Record<string, unknown>;
  const coreCollections = [
    "jobs",
    "applications",
    "applicationEvents",
    "cvVersions",
    "evaluations",
    "reminders",
    "importBatches",
  ];
  if (!coreCollections.every((key) => Array.isArray(record[key]))) {
    throw new DataConflictError("The local data store is missing required collections.");
  }
  if (record.schemaVersion === 1) {
    const seeded = createSeedData(seedUserId);
    return {
      ...(value as unknown as Omit<
        DataStoreDocument,
        "schemaVersion" | "automationRules" | "automationRuns"
      >),
      schemaVersion: DATA_STORE_SCHEMA_VERSION,
      automationRules: seeded.automationRules,
      automationRuns: [],
    };
  }
  if (
    record.schemaVersion !== DATA_STORE_SCHEMA_VERSION ||
    !Array.isArray(record.automationRules) ||
    !Array.isArray(record.automationRuns)
  ) {
    throw new DataConflictError(
      `Unsupported local data schema. Expected version ${DATA_STORE_SCHEMA_VERSION}.`,
    );
  }
  return value as DataStoreDocument;
}

async function writeDocument(filePath: string, document: DataStoreDocument): Promise<void> {
  const directory = path.dirname(filePath);
  await mkdir(directory, { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.${globalThis.crypto.randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  await rename(temporaryPath, filePath);
}

async function readDocument(filePath: string, seedUserId: string): Promise<DataStoreDocument> {
  try {
    const contents = await readFile(filePath, "utf8");
    const parsed: unknown = JSON.parse(contents);
    const document = normalizeDocument(parsed, seedUserId);
    if ((parsed as { schemaVersion?: unknown }).schemaVersion !== DATA_STORE_SCHEMA_VERSION) {
      await writeDocument(filePath, document);
    }
    return document;
  } catch (error) {
    if (!isNodeError(error, "ENOENT")) {
      throw error;
    }
    let initialization = initializationByPath.get(filePath);
    if (!initialization) {
      initialization = (async () => {
        try {
          const contents = await readFile(filePath, "utf8");
          return normalizeDocument(JSON.parse(contents) as unknown, seedUserId);
        } catch (retryError) {
          if (!isNodeError(retryError, "ENOENT")) throw retryError;
          const seeded = createSeedData(seedUserId);
          await writeDocument(filePath, seeded);
          return seeded;
        }
      })();
      initializationByPath.set(filePath, initialization);
      void initialization.finally(() => initializationByPath.delete(filePath)).catch(() => undefined);
    }
    return clone(await initialization);
  }
}

function enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = mutationQueue.then(operation, operation);
  mutationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function requireOwned<T extends { id: string; userId: string }>(
  values: T[],
  id: string,
  userId: string,
  entityName: string,
): T {
  const value = values.find((candidate) => candidate.id === id && candidate.userId === userId);
  if (!value) {
    throw new DataNotFoundError(entityName, id);
  }
  return value;
}

function optionalOwned<T extends { id: string; userId: string }>(
  values: T[],
  id: string | null | undefined,
  userId: string,
  entityName: string,
): T | null {
  if (!id) return null;
  return requireOwned(values, id, userId, entityName);
}

function buildApplicationRecord(
  document: DataStoreDocument,
  application: Application,
): ApplicationRecord {
  const job = requireOwned(document.jobs, application.jobId, application.userId, "Job");
  const cvVersion = optionalOwned(
    document.cvVersions,
    application.cvVersionId,
    application.userId,
    "CV version",
  );
  const evaluations = document.evaluations
    .filter(
      (evaluation) =>
        evaluation.userId === application.userId && evaluation.applicationId === application.id,
    )
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const events = document.applicationEvents
    .filter(
      (event) => event.userId === application.userId && event.applicationId === application.id,
    )
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));

  return clone({
    ...application,
    job,
    cvVersion,
    latestEvaluation: evaluations[0] ?? null,
    events,
  });
}

function normalizeJob(input: JobCreateInput, userId: string, timestamp: string): Job {
  if (!input.title.trim() || !input.company.trim() || !input.description.trim()) {
    throw new DataConflictError("A job requires a title, company, and description.");
  }
  if (
    input.salaryMin !== undefined &&
    input.salaryMax !== undefined &&
    input.salaryMin !== null &&
    input.salaryMax !== null &&
    input.salaryMin > input.salaryMax
  ) {
    throw new DataConflictError("Minimum salary cannot exceed maximum salary.");
  }

  return {
    id: newId(),
    userId,
    title: input.title.trim(),
    company: input.company.trim(),
    description: input.description.trim(),
    location: input.location?.trim() || null,
    workplaceType: input.workplaceType ?? "unspecified",
    employmentType: input.employmentType ?? "unspecified",
    source: input.source ?? "manual",
    sourceUrl: input.sourceUrl?.trim() || null,
    externalId: input.externalId?.trim() || null,
    salaryMin: input.salaryMin ?? null,
    salaryMax: input.salaryMax ?? null,
    salaryCurrency: input.salaryCurrency?.trim().toUpperCase() || null,
    publishedAt: input.publishedAt ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function createdEventTitle(status: ApplicationStatus): string {
  if (status === "applied") return "Application added";
  if (status === "saved") return "Role saved";
  return `Application added as ${status}`;
}

function statusEventTitle(status: ApplicationStatus): string {
  const titles: Record<ApplicationStatus, string> = {
    saved: "Role saved",
    applied: "Application submitted",
    screening: "Moved to screening",
    interview: "Interview scheduled",
    offer: "Offer received",
    rejected: "Application closed",
    withdrawn: "Application withdrawn",
    archived: "Application archived",
  };
  return titles[status];
}

function appendApplication(
  document: DataStoreDocument,
  userId: string,
  input: CreateApplicationInput,
  timestamp: string,
  batchId?: string,
): Application {
  const job = normalizeJob(input.job, userId, timestamp);
  const draft = input.application ?? {};
  if (draft.cvVersionId) {
    requireOwned(document.cvVersions, draft.cvVersionId, userId, "CV version");
  }
  if (
    job.externalId &&
    document.jobs.some(
      (candidate) =>
        candidate.userId === userId &&
        candidate.source === job.source &&
        candidate.externalId === job.externalId,
    )
  ) {
    throw new DataConflictError(`This ${job.source} job has already been imported.`);
  }

  const status = draft.status ?? "saved";
  const application: Application = {
    id: newId(),
    userId,
    jobId: job.id,
    status,
    cvVersionId: draft.cvVersionId ?? null,
    notes: draft.notes?.trim() || null,
    appliedAt: draft.appliedAt ?? (status === "applied" ? timestamp : null),
    lastActivityAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const event: ApplicationEvent = {
    id: newId(),
    userId,
    applicationId: application.id,
    type: batchId ? "imported" : "created",
    title: batchId ? "Role imported" : createdEventTitle(status),
    details: null,
    fromStatus: null,
    toStatus: status,
    occurredAt: timestamp,
    metadata: batchId ? { batchId } : {},
    createdAt: timestamp,
  };
  document.jobs.push(job);
  document.applications.push(application);
  document.applicationEvents.push(event);
  return application;
}

export interface LocalRepositoryOptions {
  userId?: string;
  filePath?: string;
}

export class LocalDataRepository implements DataRepository {
  readonly mode = "local" as const;
  readonly userId: string;
  readonly filePath: string;

  constructor(options: LocalRepositoryOptions = {}) {
    this.userId = options.userId ?? DEMO_USER_ID;
    this.filePath = options.filePath ?? process.env.JOBS_SUMMARY_LOCAL_DATA_PATH ?? DEFAULT_STORE_PATH;
  }

  private read(): Promise<DataStoreDocument> {
    return readDocument(this.filePath, this.userId);
  }

  private mutate<T>(operation: (document: DataStoreDocument) => T | Promise<T>): Promise<T> {
    return enqueueMutation(async () => {
      const document = await this.read();
      const result = await operation(document);
      await writeDocument(this.filePath, document);
      return clone(result);
    });
  }

  async listApplications(options: ApplicationListOptions = {}): Promise<ApplicationRecord[]> {
    const document = await this.read();
    const normalizedSearch = options.search?.trim().toLocaleLowerCase();
    const matching = document.applications
      .filter((application) => application.userId === this.userId)
      .filter(
        (application) => !options.statuses?.length || options.statuses.includes(application.status),
      )
      .filter((application) => {
        if (!normalizedSearch) return true;
        const job = document.jobs.find((candidate) => candidate.id === application.jobId);
        return [job?.title, job?.company, job?.location]
          .filter(Boolean)
          .some((value) => value!.toLocaleLowerCase().includes(normalizedSearch));
      })
      .sort((left, right) => right.lastActivityAt.localeCompare(left.lastActivityAt));
    const offset = Math.max(0, options.offset ?? 0);
    const limit = Math.max(0, options.limit ?? matching.length);
    return matching
      .slice(offset, offset + limit)
      .map((application) => buildApplicationRecord(document, application));
  }

  async getApplication(id: string): Promise<ApplicationRecord | null> {
    const document = await this.read();
    const application = document.applications.find(
      (candidate) => candidate.id === id && candidate.userId === this.userId,
    );
    return application ? buildApplicationRecord(document, application) : null;
  }

  createApplication(input: CreateApplicationInput): Promise<ApplicationRecord> {
    return this.mutate((document) => {
      const application = appendApplication(document, this.userId, input, now());
      return buildApplicationRecord(document, application);
    });
  }

  bulkCreateApplications(
    inputs: CreateApplicationInput[],
    batchId?: string,
  ): Promise<BulkCreateResult> {
    return this.mutate((document) => {
      const batch = batchId
        ? requireOwned(document.importBatches, batchId, this.userId, "Import batch")
        : null;
      const applications: ApplicationRecord[] = [];
      const errors: ImportError[] = [];

      inputs.forEach((input, index) => {
        try {
          const timestamp = now();
          const application = appendApplication(
            document,
            this.userId,
            input,
            timestamp,
            batchId,
          );
          applications.push(buildApplicationRecord(document, application));
        } catch (error) {
          errors.push({
            row: index + 1,
            message: error instanceof Error ? error.message : "Unknown import error",
          });
        }
      });

      if (batch) {
        const timestamp = now();
        batch.totalRows = inputs.length;
        batch.processedRows = inputs.length;
        batch.succeededRows = applications.length;
        batch.failedRows = errors.length;
        batch.errors = errors;
        batch.status =
          errors.length === 0 ? "completed" : applications.length > 0 ? "partial" : "failed";
        batch.completedAt = timestamp;
        batch.updatedAt = timestamp;
      }
      return { applications, errors };
    });
  }

  updateApplicationStatus(
    id: string,
    status: ApplicationStatus,
    notes?: string | null,
  ): Promise<ApplicationRecord> {
    return this.mutate((document) => {
      const application = requireOwned(document.applications, id, this.userId, "Application");
      const fromStatus = application.status;
      if (fromStatus === status && notes === undefined) {
        return buildApplicationRecord(document, application);
      }
      const timestamp = now();
      application.status = status;
      application.notes = notes === undefined ? application.notes : notes?.trim() || null;
      application.appliedAt ??= status === "applied" ? timestamp : null;
      application.lastActivityAt = timestamp;
      application.updatedAt = timestamp;
      document.applicationEvents.push({
        id: newId(),
        userId: this.userId,
        applicationId: id,
        type: "status_changed",
        title: statusEventTitle(status),
        details: notes?.trim() || null,
        fromStatus,
        toStatus: status,
        occurredAt: timestamp,
        metadata: {},
        createdAt: timestamp,
      });
      return buildApplicationRecord(document, application);
    });
  }

  updateApplicationCv(id: string, cvVersionId: string | null): Promise<ApplicationRecord> {
    return this.mutate((document) => {
      const application = requireOwned(document.applications, id, this.userId, "Application");
      const cvVersion = optionalOwned(
        document.cvVersions,
        cvVersionId,
        this.userId,
        "CV version",
      );
      const timestamp = now();
      application.cvVersionId = cvVersion?.id ?? null;
      application.lastActivityAt = timestamp;
      application.updatedAt = timestamp;
      document.applicationEvents.push({
        id: newId(),
        userId: this.userId,
        applicationId: id,
        type: "cv_attached",
        title: cvVersion ? `Attached ${cvVersion.name}` : "Removed attached CV",
        details: null,
        fromStatus: null,
        toStatus: null,
        occurredAt: timestamp,
        metadata: cvVersion ? { cvVersionId: cvVersion.id } : {},
        createdAt: timestamp,
      });
      return buildApplicationRecord(document, application);
    });
  }

  deleteApplication(id: string): Promise<void> {
    return this.mutate((document) => {
      const application = requireOwned(document.applications, id, this.userId, "Application");
      document.applications = document.applications.filter((item) => item.id !== id);
      document.jobs = document.jobs.filter((item) => item.id !== application.jobId);
      document.applicationEvents = document.applicationEvents.filter(
        (item) => item.applicationId !== id,
      );
      document.evaluations = document.evaluations.filter((item) => item.applicationId !== id);
      document.reminders = document.reminders.filter((item) => item.applicationId !== id);
    });
  }

  async listJobs(): Promise<Job[]> {
    const document = await this.read();
    return clone(
      document.jobs
        .filter((job) => job.userId === this.userId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    );
  }

  async getJob(id: string): Promise<Job | null> {
    const document = await this.read();
    return clone(
      document.jobs.find((job) => job.id === id && job.userId === this.userId) ?? null,
    );
  }

  createJob(input: JobCreateInput): Promise<Job> {
    return this.mutate((document) => {
      const job = normalizeJob(input, this.userId, now());
      document.jobs.push(job);
      return job;
    });
  }

  async updateJob(id: string, input: JobUpdateInput): Promise<Job> {
    const job = await this.getJob(id);
    if (!job) throw new DataNotFoundError("Job", id);
    void input;
    throw new DataConflictError("Captured job snapshots are immutable; create a new role instead.");
  }

  async listApplicationEvents(applicationId: string): Promise<ApplicationEvent[]> {
    const document = await this.read();
    requireOwned(document.applications, applicationId, this.userId, "Application");
    return clone(
      document.applicationEvents
        .filter(
          (event) => event.applicationId === applicationId && event.userId === this.userId,
        )
        .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)),
    );
  }

  createApplicationEvent(input: ApplicationEventCreateInput): Promise<ApplicationEvent> {
    return this.mutate((document) => {
      const application = requireOwned(
        document.applications,
        input.applicationId,
        this.userId,
        "Application",
      );
      const timestamp = input.occurredAt ?? now();
      const event: ApplicationEvent = {
        id: newId(),
        userId: this.userId,
        applicationId: application.id,
        type: input.type,
        title: input.title.trim(),
        details: input.details?.trim() || null,
        fromStatus: input.fromStatus ?? null,
        toStatus: input.toStatus ?? null,
        occurredAt: timestamp,
        metadata: input.metadata ?? {},
        createdAt: now(),
      };
      application.lastActivityAt = timestamp;
      application.updatedAt = now();
      document.applicationEvents.push(event);
      return event;
    });
  }

  async listCvVersions(): Promise<CvVersion[]> {
    const document = await this.read();
    return clone(
      document.cvVersions
        .filter((cv) => cv.userId === this.userId)
        .sort(
          (left, right) =>
            Number(right.isDefault) - Number(left.isDefault) ||
            right.updatedAt.localeCompare(left.updatedAt),
        ),
    );
  }

  async getCvVersion(id: string): Promise<CvVersion | null> {
    const document = await this.read();
    return clone(
      document.cvVersions.find((cv) => cv.id === id && cv.userId === this.userId) ?? null,
    );
  }

  createCvVersion(input: CvVersionCreateInput): Promise<CvVersion> {
    return this.mutate((document) => {
      if (!input.name.trim() || !input.content.trim()) {
        throw new DataConflictError("A CV version requires a name and content.");
      }
      const timestamp = now();
      const shouldBeDefault = input.isDefault ?? !document.cvVersions.some(
        (candidate) => candidate.userId === this.userId,
      );
      if (shouldBeDefault) {
        document.cvVersions
          .filter((candidate) => candidate.userId === this.userId)
          .forEach((candidate) => {
            candidate.isDefault = false;
            candidate.updatedAt = timestamp;
          });
      }
      const cvVersion: CvVersion = {
        id: newId(),
        userId: this.userId,
        name: input.name.trim(),
        summary: input.summary?.trim() || null,
        content: input.content.trim(),
        fileName: input.fileName?.trim() || null,
        storagePath: input.storagePath?.trim() || null,
        mimeType: input.mimeType?.trim() || null,
        skills: [...new Set(input.skills?.map((skill) => skill.trim()).filter(Boolean) ?? [])],
        isDefault: shouldBeDefault,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      document.cvVersions.push(cvVersion);
      return cvVersion;
    });
  }

  updateCvVersion(id: string, input: CvVersionUpdateInput): Promise<CvVersion> {
    return this.mutate((document) => {
      const cvVersion = requireOwned(document.cvVersions, id, this.userId, "CV version");
      if (Object.keys(input).some((key) => key !== "name" && key !== "isDefault")) {
        throw new DataConflictError("Imported CV evidence is immutable; create a new version instead.");
      }
      const timestamp = now();
      if (input.name !== undefined) cvVersion.name = input.name.trim();
      if (input.isDefault !== undefined) {
        cvVersion.isDefault = input.isDefault;
        if (input.isDefault) {
          document.cvVersions
            .filter((candidate) => candidate.userId === this.userId && candidate.id !== id)
            .forEach((candidate) => {
              candidate.isDefault = false;
              candidate.updatedAt = timestamp;
            });
        }
      }
      if (!cvVersion.name) throw new DataConflictError("A CV version requires a name.");
      cvVersion.updatedAt = timestamp;
      return cvVersion;
    });
  }

  deleteCvVersion(id: string): Promise<void> {
    return this.mutate((document) => {
      const cvVersion = requireOwned(document.cvVersions, id, this.userId, "CV version");
      const timestamp = now();
      document.applications
        .filter(application => application.userId === this.userId && application.cvVersionId === id)
        .forEach(application => {
          application.cvVersionId = null;
          application.updatedAt = timestamp;
        });
      document.evaluations
        .filter(evaluation => evaluation.userId === this.userId && evaluation.cvVersionId === id)
        .forEach(evaluation => {
          evaluation.cvVersionId = null;
          evaluation.updatedAt = timestamp;
        });
      document.cvVersions.splice(document.cvVersions.indexOf(cvVersion), 1);
    });
  }

  async listEvaluations(jobId?: string): Promise<Evaluation[]> {
    const document = await this.read();
    return clone(
      document.evaluations
        .filter(
          (evaluation) =>
            evaluation.userId === this.userId && (!jobId || evaluation.jobId === jobId),
        )
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    );
  }

  async getEvaluation(id: string): Promise<Evaluation | null> {
    const document = await this.read();
    return clone(
      document.evaluations.find(
        (evaluation) => evaluation.id === id && evaluation.userId === this.userId,
      ) ?? null,
    );
  }

  createEvaluation(input: EvaluationCreateInput): Promise<Evaluation> {
    return this.mutate((document) => {
      const application = requireOwned(
        document.applications,
        input.applicationId,
        this.userId,
        "Application",
      );
      if (input.jobId && input.jobId !== application.jobId) {
        throw new DataConflictError("Evaluation job does not belong to the application.");
      }
      const cvVersionId = input.cvVersionId ?? application.cvVersionId;
      optionalOwned(document.cvVersions, cvVersionId, this.userId, "CV version");
      if (
        input.overallScore !== undefined &&
        input.overallScore !== null &&
        (input.overallScore < 0 || input.overallScore > 100)
      ) {
        throw new DataConflictError("Evaluation score must be between 0 and 100.");
      }
      const timestamp = now();
      const status = input.status ?? (input.overallScore !== undefined ? "completed" : "pending");
      const evaluation: Evaluation = {
        id: newId(),
        userId: this.userId,
        applicationId: application.id,
        jobId: application.jobId,
        cvVersionId: cvVersionId ?? null,
        status,
        recommendation: input.recommendation ?? null,
        overallScore: input.overallScore ?? null,
        summary: input.summary?.trim() || null,
        strengths: input.strengths ?? [],
        gaps: input.gaps ?? [],
        evidence: input.evidence ?? [],
        suggestedEdits: input.suggestedEdits ?? [],
        model: input.model?.trim() || null,
        promptVersion: input.promptVersion?.trim() || null,
        errorMessage: input.errorMessage?.trim() || null,
        createdAt: timestamp,
        updatedAt: timestamp,
        completedAt: input.completedAt ?? (status === "completed" ? timestamp : null),
      };
      document.evaluations.push(evaluation);
      return evaluation;
    });
  }

  updateEvaluation(id: string, input: EvaluationUpdateInput): Promise<Evaluation> {
    return this.mutate((document) => {
      const evaluation = requireOwned(document.evaluations, id, this.userId, "Evaluation");
      if (
        input.overallScore !== undefined &&
        input.overallScore !== null &&
        (input.overallScore < 0 || input.overallScore > 100)
      ) {
        throw new DataConflictError("Evaluation score must be between 0 and 100.");
      }
      if (input.cvVersionId !== undefined) {
        optionalOwned(document.cvVersions, input.cvVersionId, this.userId, "CV version");
        evaluation.cvVersionId = input.cvVersionId;
      }
      if (input.status !== undefined) evaluation.status = input.status;
      if (input.recommendation !== undefined) evaluation.recommendation = input.recommendation;
      if (input.overallScore !== undefined) evaluation.overallScore = input.overallScore;
      if (input.summary !== undefined) evaluation.summary = input.summary?.trim() || null;
      if (input.strengths !== undefined) evaluation.strengths = input.strengths;
      if (input.gaps !== undefined) evaluation.gaps = input.gaps;
      if (input.evidence !== undefined) evaluation.evidence = input.evidence;
      if (input.suggestedEdits !== undefined) evaluation.suggestedEdits = input.suggestedEdits;
      if (input.model !== undefined) evaluation.model = input.model?.trim() || null;
      if (input.promptVersion !== undefined) {
        evaluation.promptVersion = input.promptVersion?.trim() || null;
      }
      if (input.errorMessage !== undefined) {
        evaluation.errorMessage = input.errorMessage?.trim() || null;
      }
      if (input.completedAt !== undefined) evaluation.completedAt = input.completedAt;
      if (evaluation.status === "completed" && !evaluation.completedAt) {
        evaluation.completedAt = now();
      }
      evaluation.updatedAt = now();
      return evaluation;
    });
  }

  async listReminders(includeCompleted = false): Promise<Reminder[]> {
    const document = await this.read();
    return clone(
      document.reminders
        .filter(
          (reminder) =>
            reminder.userId === this.userId && (includeCompleted || reminder.status === "pending"),
        )
        .sort((left, right) => left.dueAt.localeCompare(right.dueAt)),
    );
  }

  upsertReminder(input: ReminderUpsertInput): Promise<Reminder> {
    return this.mutate((document) => {
      if (!input.title.trim()) throw new DataConflictError("A reminder requires a title.");
      if (input.applicationId) {
        requireOwned(document.applications, input.applicationId, this.userId, "Application");
      }
      const timestamp = now();
      if (input.id) {
        const reminder = requireOwned(document.reminders, input.id, this.userId, "Reminder");
        reminder.applicationId = input.applicationId ?? reminder.applicationId;
        reminder.title = input.title.trim();
        reminder.notes = input.notes === undefined ? reminder.notes : input.notes?.trim() || null;
        reminder.dueAt = input.dueAt;
        reminder.status = input.status ?? reminder.status;
        reminder.completedAt = reminder.status === "completed" ? reminder.completedAt ?? timestamp : null;
        reminder.updatedAt = timestamp;
        return reminder;
      }
      const reminder: Reminder = {
        id: newId(),
        userId: this.userId,
        applicationId: input.applicationId ?? null,
        title: input.title.trim(),
        notes: input.notes?.trim() || null,
        dueAt: input.dueAt,
        status: input.status ?? "pending",
        completedAt: input.status === "completed" ? timestamp : null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      document.reminders.push(reminder);
      return reminder;
    });
  }

  completeReminder(id: string): Promise<Reminder> {
    return this.mutate((document) => {
      const reminder = requireOwned(document.reminders, id, this.userId, "Reminder");
      if (reminder.status === "completed") return reminder;
      if (reminder.status !== "pending") throw new DataNotFoundError("Reminder", id);
      const timestamp = now();
      reminder.status = "completed";
      reminder.completedAt = timestamp;
      reminder.updatedAt = timestamp;
      return reminder;
    });
  }

  dismissReminder(id: string): Promise<Reminder> {
    return this.mutate((document) => {
      const reminder = requireOwned(document.reminders, id, this.userId, "Reminder");
      if (reminder.status === "dismissed") return reminder;
      if (reminder.status !== "pending") throw new DataNotFoundError("Reminder", id);
      reminder.status = "dismissed";
      reminder.completedAt = null;
      reminder.updatedAt = now();
      return reminder;
    });
  }

  async listImportBatches(): Promise<ImportBatch[]> {
    const document = await this.read();
    return clone(
      document.importBatches
        .filter((batch) => batch.userId === this.userId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    );
  }

  createImportBatch(input: ImportBatchCreateInput): Promise<ImportBatch> {
    return this.mutate((document) => {
      const timestamp = now();
      const batch: ImportBatch = {
        id: newId(),
        userId: this.userId,
        source: input.source,
        fileName: input.fileName?.trim() || null,
        status: input.status ?? "pending",
        totalRows: input.totalRows ?? 0,
        processedRows: 0,
        succeededRows: 0,
        failedRows: 0,
        errors: [],
        createdAt: timestamp,
        updatedAt: timestamp,
        completedAt: null,
      };
      document.importBatches.push(batch);
      return batch;
    });
  }

  updateImportBatch(id: string, input: ImportBatchUpdateInput): Promise<ImportBatch> {
    return this.mutate((document) => {
      const batch = requireOwned(document.importBatches, id, this.userId, "Import batch");
      if (input.status !== undefined) batch.status = input.status;
      if (input.totalRows !== undefined) batch.totalRows = input.totalRows;
      if (input.processedRows !== undefined) batch.processedRows = input.processedRows;
      if (input.succeededRows !== undefined) batch.succeededRows = input.succeededRows;
      if (input.failedRows !== undefined) batch.failedRows = input.failedRows;
      if (input.errors !== undefined) batch.errors = input.errors;
      if (input.completedAt !== undefined) batch.completedAt = input.completedAt;
      batch.updatedAt = now();
      return batch;
    });
  }

  async listAutomationRules(): Promise<AutomationRule[]> {
    const document = await this.read();
    return clone(
      document.automationRules
        .filter((rule) => rule.userId === this.userId)
        .sort((left, right) => left.type.localeCompare(right.type)),
    );
  }

  upsertAutomationRule(input: AutomationRuleUpsertInput): Promise<AutomationRule> {
    return this.mutate((document) => {
      const timestamp = now();
      const existing = input.id
        ? requireOwned(document.automationRules, input.id, this.userId, "Automation rule")
        : document.automationRules.find(
            (rule) => rule.userId === this.userId && rule.type === input.type,
          );
      if (existing) {
        if (existing.type !== input.type) {
          throw new DataConflictError("An automation rule's type cannot be changed.");
        }
        existing.enabled = input.enabled;
        existing.config = clone(input.config ?? existing.config);
        existing.updatedAt = timestamp;
        return existing;
      }
      const rule: AutomationRule = {
        id: newId(),
        userId: this.userId,
        type: input.type,
        enabled: input.enabled,
        config: clone(input.config ?? {}),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      document.automationRules.push(rule);
      return rule;
    });
  }

  async listAutomationRuns(options: AutomationRunListOptions = {}): Promise<AutomationRun[]> {
    const document = await this.read();
    return clone(
      document.automationRuns
        .filter(
          (run) =>
            run.userId === this.userId &&
            (!options.applicationId || run.applicationId === options.applicationId) &&
            (!options.statuses?.length || options.statuses.includes(run.status)),
        )
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, Math.max(0, options.limit ?? document.automationRuns.length)),
    );
  }

  async getAutomationRunByIdempotencyKey(idempotencyKey: string): Promise<AutomationRun | null> {
    const document = await this.read();
    return clone(
      document.automationRuns.find(
        (run) => run.userId === this.userId && run.idempotencyKey === idempotencyKey,
      ) ?? null,
    );
  }

  createAutomationRun(input: AutomationRunCreateInput): Promise<AutomationRun> {
    return this.mutate((document) => {
      if (!input.idempotencyKey.trim()) {
        throw new DataConflictError("An automation run requires an idempotency key.");
      }
      if (
        document.automationRuns.some(
          (run) =>
            run.userId === this.userId && run.idempotencyKey === input.idempotencyKey.trim(),
        )
      ) {
        throw new DataConflictError("An automation run already exists for this idempotency key.");
      }
      const rule = optionalOwned(
        document.automationRules,
        input.ruleId,
        this.userId,
        "Automation rule",
      );
      if (rule && rule.type !== input.type) {
        throw new DataConflictError("Automation run type must match its rule type.");
      }
      if (input.applicationId) {
        requireOwned(document.applications, input.applicationId, this.userId, "Application");
      }
      if (!Number.isSafeInteger(input.attempts ?? 0) || (input.attempts ?? 0) < 0) {
        throw new DataConflictError("Automation run attempts must be a non-negative integer.");
      }
      const timestamp = now();
      const status = input.status ?? "pending";
      const terminal = ["succeeded", "failed", "cancelled"].includes(status);
      const run: AutomationRun = {
        id: newId(),
        userId: this.userId,
        ruleId: rule?.id ?? null,
        applicationId: input.applicationId ?? null,
        type: input.type,
        status,
        idempotencyKey: input.idempotencyKey.trim(),
        errorMessage: input.errorMessage?.trim() || null,
        attempts: input.attempts ?? 0,
        scheduledAt: input.scheduledAt ?? timestamp,
        startedAt: input.startedAt ?? (status === "running" ? timestamp : null),
        completedAt: input.completedAt ?? (terminal ? timestamp : null),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      document.automationRuns.push(run);
      return run;
    });
  }

  updateAutomationRun(id: string, input: AutomationRunUpdateInput): Promise<AutomationRun> {
    return this.mutate((document) => {
      const run = requireOwned(document.automationRuns, id, this.userId, "Automation run");
      if (
        input.attempts !== undefined &&
        (!Number.isSafeInteger(input.attempts) || input.attempts < 0)
      ) {
        throw new DataConflictError("Automation run attempts must be a non-negative integer.");
      }
      const timestamp = now();
      if (input.status !== undefined) run.status = input.status;
      if (input.errorMessage !== undefined) run.errorMessage = input.errorMessage?.trim() || null;
      if (input.attempts !== undefined) run.attempts = input.attempts;
      if (input.scheduledAt !== undefined) run.scheduledAt = input.scheduledAt;
      if (input.startedAt !== undefined) run.startedAt = input.startedAt;
      if (input.completedAt !== undefined) run.completedAt = input.completedAt;
      if (run.status === "running" && !run.startedAt) run.startedAt = timestamp;
      if (["succeeded", "failed", "cancelled"].includes(run.status) && !run.completedAt) {
        run.completedAt = timestamp;
      }
      if (["pending", "running"].includes(run.status) && input.completedAt === undefined) {
        run.completedAt = null;
      }
      run.updatedAt = timestamp;
      return run;
    });
  }

  async getDashboardSnapshot() {
    const [applications, reminders] = await Promise.all([
      this.listApplications(),
      this.listReminders(),
    ]);
    return calculateDashboardSnapshot(applications, reminders);
  }
}

/** Resets a chosen local store to deterministic demo data. Intended for tests and demos only. */
export function resetLocalDemoData(options: LocalRepositoryOptions = {}): Promise<void> {
  const filePath = options.filePath ?? process.env.JOBS_SUMMARY_LOCAL_DATA_PATH ?? DEFAULT_STORE_PATH;
  return enqueueMutation(() => writeDocument(filePath, createSeedData(options.userId ?? DEMO_USER_ID)));
}
