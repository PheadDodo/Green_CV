import { describe, expect, it, vi } from "vitest";
import { SupabaseDataRepository } from "./supabase-repository";
import { REMINDER_AUTOMATION_RUN_LEASE_MS } from "./types";

describe("SupabaseDataRepository reminders", () => {
  it("returns an existing dismissal on retry without rewriting reminder history", async () => {
    const updateQuery = fluentQuery({ data: null, error: null });
    const dismissedRow = {
      id: "10000000-0000-4000-8000-000000000001",
      user_id: "owner-id",
      application_id: null,
      title: "Follow up",
      notes: null,
      due_at: "2026-09-03T09:00:00.000Z",
      status: "dismissed" as const,
      completed_at: null,
      created_at: "2026-09-01T09:00:00.000Z",
      updated_at: "2026-09-02T09:00:00.000Z",
    };
    const lookupQuery = fluentQuery({ data: dismissedRow, error: null });
    const from = vi.fn()
      .mockReturnValueOnce(updateQuery)
      .mockReturnValueOnce(lookupQuery);
    const repository = new SupabaseDataRepository({ from } as never, "owner-id");

    const reminder = await repository.dismissReminder(dismissedRow.id);

    expect(reminder.status).toBe("dismissed");
    expect(reminder.updatedAt).toBe(dismissedRow.updated_at);
    expect(updateQuery.update).toHaveBeenCalledWith({ status: "dismissed", completed_at: null });
    expect(updateQuery.eq).toHaveBeenCalledWith("status", "pending");
    expect(lookupQuery.eq).toHaveBeenCalledWith("user_id", "owner-id");
    expect(lookupQuery.eq).toHaveBeenCalledWith("status", "dismissed");
  });
});

describe("SupabaseDataRepository application deletion", () => {
  it("deletes the owner-scoped parent job so PostgreSQL cascades the aggregate atomically", async () => {
    const applicationLookup = fluentQuery({
      data: { job_id: "job-id" },
      error: null,
    });
    const jobDelete = fluentQuery({ data: { id: "job-id" }, error: null });
    const from = vi.fn()
      .mockReturnValueOnce(applicationLookup)
      .mockReturnValueOnce(jobDelete);
    const repository = new SupabaseDataRepository({ from } as never, "owner-id");

    await repository.deleteApplication("application-id");

    expect(from).toHaveBeenNthCalledWith(1, "applications");
    expect(applicationLookup.select).toHaveBeenCalledWith("job_id");
    expect(applicationLookup.eq).toHaveBeenCalledWith("id", "application-id");
    expect(applicationLookup.eq).toHaveBeenCalledWith("user_id", "owner-id");
    expect(from).toHaveBeenNthCalledWith(2, "jobs");
    expect(jobDelete.delete).toHaveBeenCalledOnce();
    expect(jobDelete.eq).toHaveBeenCalledWith("id", "job-id");
    expect(jobDelete.eq).toHaveBeenCalledWith("user_id", "owner-id");
  });

  it("does not issue a delete when the owner-scoped application lookup misses", async () => {
    const applicationLookup = fluentQuery({ data: null, error: null });
    const from = vi.fn().mockReturnValue(applicationLookup);
    const repository = new SupabaseDataRepository({ from } as never, "owner-id");

    await expect(repository.deleteApplication("foreign-id")).rejects.toThrow(/not found/i);

    expect(from).toHaveBeenCalledTimes(1);
    expect(applicationLookup.delete).not.toHaveBeenCalled();
  });
});

describe("SupabaseDataRepository imports", () => {
  it("deletes only the owner's import audit batch", async () => {
    const deletedBatch = importBatchRow();
    const deleteQuery = fluentQuery({ data: { id: deletedBatch.id }, error: null });
    const from = vi.fn().mockReturnValue(deleteQuery);
    const repository = new SupabaseDataRepository({ from } as never, "owner-id");

    await repository.deleteImportBatch(deletedBatch.id);

    expect(from).toHaveBeenCalledWith("import_batches");
    expect(deleteQuery.delete).toHaveBeenCalledOnce();
    expect(deleteQuery.eq).toHaveBeenCalledWith("id", deletedBatch.id);
    expect(deleteQuery.eq).toHaveBeenCalledWith("user_id", "owner-id");
    expect(deleteQuery.select).toHaveBeenCalledWith("id");
  });

  it("reports an owner-scoped miss instead of revealing a foreign import batch", async () => {
    const deleteQuery = fluentQuery({ data: null, error: null });
    const repository = new SupabaseDataRepository(
      { from: vi.fn().mockReturnValue(deleteQuery) } as never,
      "owner-id",
    );

    await expect(repository.deleteImportBatch("foreign-batch-id")).rejects.toThrow(/not found/i);
  });

  it("classifies each bulk row once from the atomic imported-application result", async () => {
    const batch = importBatchRow();
    const batchLookup = collectionQuery({ data: [batch], error: null });
    const processingUpdate = fluentQuery({
      data: { ...batch, status: "processing", total_rows: 2 },
      error: null,
    });
    const completedUpdate = fluentQuery({
      data: {
        ...batch,
        status: "partial",
        total_rows: 2,
        processed_rows: 2,
        succeeded_rows: 1,
        failed_rows: 1,
      },
      error: null,
    });
    const from = vi.fn()
      .mockReturnValueOnce(batchLookup)
      .mockReturnValueOnce(processingUpdate)
      .mockReturnValueOnce(completedUpdate);
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: importedApplicationPayload(), error: null })
      .mockResolvedValueOnce({
        data: null,
        error: { code: "23505", message: "This CSV job has already been imported." },
      });
    const repository = new SupabaseDataRepository({ from, rpc } as never, "owner-id");
    const inputs = [
      {
        job: {
          title: "ML Engineer",
          company: "Northstar",
          description: "Build reliable machine learning systems in production.",
          source: "csv" as const,
          externalId: "role-1",
        },
      },
      {
        job: {
          title: "Data Scientist",
          company: "Northstar",
          description: "Develop trustworthy statistical models for product teams.",
          source: "csv" as const,
          externalId: "role-1",
        },
      },
    ];

    const result = await repository.bulkCreateApplications(inputs, batch.id);

    expect(result.applications).toHaveLength(1);
    expect(result.applications[0]).toMatchObject({
      id: "30000000-0000-4000-8000-000000000001",
      job: { id: "20000000-0000-4000-8000-000000000001", source: "csv" },
      events: [{ type: "imported", metadata: { batchId: batch.id } }],
      latestEvaluation: null,
    });
    expect(result.errors).toEqual([{
      row: 2,
      message: "This CSV job has already been imported.",
    }]);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenNthCalledWith(1, "create_imported_application", {
      p_job: inputs[0].job,
      p_application: {},
      p_batch_id: batch.id,
    });
    expect(completedUpdate.update).toHaveBeenCalledWith(expect.objectContaining({
      total_rows: 2,
      processed_rows: 2,
      succeeded_rows: 1,
      failed_rows: 1,
      status: "partial",
    }));
    expect(from).toHaveBeenCalledTimes(3);
  });

  it("resets batch counters in one valid write before classifying a new bulk attempt", async () => {
    const batch = importBatchRow({
      status: "completed",
      total_rows: 5,
      processed_rows: 5,
      succeeded_rows: 5,
      failed_rows: 0,
      completed_at: "2026-09-04T08:30:00.000Z",
    });
    const batchLookup = collectionQuery({ data: [batch], error: null });
    const processingUpdate = fluentQuery({ data: batch, error: null });
    const completedUpdate = fluentQuery({ data: batch, error: null });
    const from = vi.fn()
      .mockReturnValueOnce(batchLookup)
      .mockReturnValueOnce(processingUpdate)
      .mockReturnValueOnce(completedUpdate);
    const rpc = vi.fn().mockResolvedValue({ data: importedApplicationPayload(), error: null });
    const repository = new SupabaseDataRepository({ from, rpc } as never, "owner-id");

    await repository.bulkCreateApplications([{
      job: {
        title: "ML Engineer",
        company: "Northstar",
        description: "Build reliable machine learning systems in production.",
        source: "csv",
      },
    }], batch.id);

    expect(processingUpdate.update).toHaveBeenCalledWith({
      status: "processing",
      total_rows: 1,
      processed_rows: 0,
      succeeded_rows: 0,
      failed_rows: 0,
      errors: [],
      completed_at: null,
    });
  });
});

describe("SupabaseDataRepository automation reliability", () => {
  it("claims due work with one owner-scoped compare-and-set", async () => {
    const claimedRow = automationRunRow({
      status: "running",
      attempts: 2,
      started_at: "2026-09-04T08:00:00.000Z",
      completed_at: null,
      error_message: null,
    });
    const claimQuery = fluentQuery({ data: claimedRow, error: null });
    const from = vi.fn().mockReturnValue(claimQuery);
    const repository = new SupabaseDataRepository({ from } as never, "owner-id");

    const claimed = await repository.claimAutomationRun(claimedRow.id, {
      expectedAttempts: 1,
      startedAt: "2026-09-04T08:00:00.000Z",
    });

    expect(claimed).toMatchObject({ status: "running", attempts: 2 });
    expect(from).toHaveBeenCalledWith("automation_runs");
    expect(claimQuery.update).toHaveBeenCalledWith({
      status: "running",
      attempts: 2,
      started_at: "2026-09-04T08:00:00.000Z",
      completed_at: null,
      error_message: null,
    });
    expect(claimQuery.eq).toHaveBeenCalledWith("id", claimedRow.id);
    expect(claimQuery.eq).toHaveBeenCalledWith("user_id", "owner-id");
    expect(claimQuery.eq).toHaveBeenCalledWith("attempts", 1);
    expect(claimQuery.lt).toHaveBeenCalledWith("attempts", 4);
    expect(claimQuery.lte).toHaveBeenCalledWith(
      "scheduled_at",
      "2026-09-04T08:00:00.000Z",
    );
  });

  it("atomically admits only expired running reminder leases for another claim", async () => {
    const claimedAt = "2026-09-04T08:10:00.000Z";
    const claimedRow = automationRunRow({
      status: "running",
      attempts: 2,
      started_at: claimedAt,
      completed_at: null,
    });
    const claimQuery = fluentQuery({ data: claimedRow, error: null });
    const repository = new SupabaseDataRepository({ from: vi.fn(() => claimQuery) } as never, "owner-id");

    await repository.claimAutomationRun(claimedRow.id, {
      expectedAttempts: 1,
      startedAt: claimedAt,
    });

    const leaseCutoff = new Date(
      Date.parse(claimedAt) - REMINDER_AUTOMATION_RUN_LEASE_MS,
    ).toISOString();
    expect(claimQuery.or).toHaveBeenCalledWith(
      `status.in.(pending,failed),and(status.eq.running,type.in.(follow_up,interview_prep),started_at.is.null),and(status.eq.running,type.in.(follow_up,interview_prep),started_at.lte.${leaseCutoff})`,
    );
  });

  it("returns null when another worker wins the automation claim", async () => {
    const claimQuery = fluentQuery({ data: null, error: null });
    const repository = new SupabaseDataRepository({ from: vi.fn(() => claimQuery) } as never, "owner-id");

    await expect(repository.claimAutomationRun("run-id", {
      expectedAttempts: 0,
      startedAt: "2026-09-04T08:00:00.000Z",
    })).resolves.toBeNull();
  });

  it("cancels retryable work once and returns an unchanged cancellation on replay", async () => {
    const cancelledRow = automationRunRow({
      status: "cancelled",
      attempts: 2,
      completed_at: "2026-09-04T08:00:00.000Z",
      updated_at: "2026-09-04T08:00:00.000Z",
    });
    const firstUpdate = fluentQuery({ data: cancelledRow, error: null });
    const replayedUpdate = fluentQuery({ data: null, error: null });
    const replayLookup = fluentQuery({ data: cancelledRow, error: null });
    const from = vi.fn()
      .mockReturnValueOnce(firstUpdate)
      .mockReturnValueOnce(replayedUpdate)
      .mockReturnValueOnce(replayLookup);
    const repository = new SupabaseDataRepository({ from } as never, "owner-id");

    const cancelled = await repository.cancelAutomationRun(cancelledRow.id);
    const replayed = await repository.cancelAutomationRun(cancelledRow.id);

    expect(replayed).toEqual(cancelled);
    expect(firstUpdate.in).toHaveBeenCalledWith("status", ["pending", "failed"]);
    expect(firstUpdate.lt).toHaveBeenCalledWith("attempts", 4);
    expect(replayLookup.select).toHaveBeenCalledWith("*");
    expect(replayed.completedAt).toBe("2026-09-04T08:00:00.000Z");
  });

  it("rejects cancellation once a run is no longer cancellable", async () => {
    const updateQuery = fluentQuery({ data: null, error: null });
    const lookupQuery = fluentQuery({
      data: automationRunRow({ status: "running", attempts: 1, completed_at: null }),
      error: null,
    });
    const from = vi.fn()
      .mockReturnValueOnce(updateQuery)
      .mockReturnValueOnce(lookupQuery);
    const repository = new SupabaseDataRepository({ from } as never, "owner-id");

    await expect(repository.cancelAutomationRun("run-id")).rejects.toThrow(/cannot be cancelled/i);
  });

  it("uses the automation run id for an idempotent reminder and preserves terminal state", async () => {
    const runRow = automationRunRow({ status: "running", attempts: 1, completed_at: null });
    const reminder = reminderRow({ id: runRow.id });
    const firstRunLookup = fluentQuery({ data: runRow, error: null });
    const firstReminderLookup = fluentQuery({ data: null, error: null });
    const insertQuery = fluentQuery({ data: reminder, error: null });
    const replayRunLookup = fluentQuery({ data: runRow, error: null });
    const replayReminderLookup = fluentQuery({
      data: { ...reminder, status: "completed", completed_at: "2026-09-04T09:00:00.000Z" },
      error: null,
    });
    const from = vi.fn()
      .mockReturnValueOnce(firstRunLookup)
      .mockReturnValueOnce(firstReminderLookup)
      .mockReturnValueOnce(insertQuery)
      .mockReturnValueOnce(replayRunLookup)
      .mockReturnValueOnce(replayReminderLookup);
    const repository = new SupabaseDataRepository({ from } as never, "owner-id");
    const input = {
      applicationId: "application-id",
      title: "Follow up with Northstar",
      notes: "Ask about the role.",
      dueAt: "2026-09-05T08:00:00.000Z",
    };

    const created = await repository.ensureAutomationReminder(runRow.id, input);
    const replayed = await repository.ensureAutomationReminder(runRow.id, input);

    expect(created.id).toBe(runRow.id);
    expect(insertQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      id: runRow.id,
      user_id: "owner-id",
      application_id: "application-id",
      status: "pending",
    }));
    expect(replayed.status).toBe("completed");
    expect(from).toHaveBeenCalledTimes(5);
  });

  it("recovers the existing deterministic reminder when concurrent insertion wins", async () => {
    const runRow = automationRunRow({ status: "running", attempts: 1, completed_at: null });
    const reminder = reminderRow({ id: runRow.id });
    const runLookup = fluentQuery({ data: runRow, error: null });
    const reminderMiss = fluentQuery({ data: null, error: null });
    const losingInsert = fluentQuery({
      data: null,
      error: { code: "23505", message: "duplicate key" },
    });
    const winnerLookup = fluentQuery({ data: reminder, error: null });
    const from = vi.fn()
      .mockReturnValueOnce(runLookup)
      .mockReturnValueOnce(reminderMiss)
      .mockReturnValueOnce(losingInsert)
      .mockReturnValueOnce(winnerLookup);
    const repository = new SupabaseDataRepository({ from } as never, "owner-id");

    const result = await repository.ensureAutomationReminder(runRow.id, {
      applicationId: "application-id",
      title: reminder.title,
      dueAt: reminder.due_at,
    });

    expect(result.id).toBe(runRow.id);
    expect(from).toHaveBeenCalledTimes(4);
  });
});

function automationRunRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "90000000-0000-4000-8000-000000000001",
    user_id: "owner-id",
    rule_id: "80000000-0000-4000-8000-000000000001",
    application_id: "application-id",
    type: "follow_up" as const,
    status: "pending" as const,
    idempotency_key: "automation:v1:follow-up:test",
    error_message: null,
    attempts: 0,
    scheduled_at: "2026-09-04T07:00:00.000Z",
    started_at: null,
    completed_at: null,
    created_at: "2026-09-04T07:00:00.000Z",
    updated_at: "2026-09-04T07:00:00.000Z",
    ...overrides,
  };
}

function reminderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "60000000-0000-4000-8000-000000000001",
    user_id: "owner-id",
    application_id: "application-id",
    title: "Follow up with Northstar",
    notes: "Ask about the role.",
    due_at: "2026-09-05T08:00:00.000Z",
    status: "pending" as const,
    completed_at: null,
    created_at: "2026-09-04T08:00:00.000Z",
    updated_at: "2026-09-04T08:00:00.000Z",
    ...overrides,
  };
}

function importBatchRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    user_id: "owner-id",
    source: "csv" as const,
    file_name: "roles.csv",
    status: "pending" as const,
    total_rows: 2,
    processed_rows: 0,
    succeeded_rows: 0,
    failed_rows: 0,
    errors: [],
    created_at: "2026-09-04T08:00:00.000Z",
    updated_at: "2026-09-04T08:00:00.000Z",
    completed_at: null,
    ...overrides,
  };
}

function importedApplicationPayload() {
  const timestamp = "2026-09-04T08:00:00.000Z";
  const batchId = "10000000-0000-4000-8000-000000000001";
  const jobId = "20000000-0000-4000-8000-000000000001";
  const applicationId = "30000000-0000-4000-8000-000000000001";
  return {
    job: {
      id: jobId,
      user_id: "owner-id",
      title: "ML Engineer",
      company: "Northstar",
      location: null,
      workplace_type: "unspecified" as const,
      employment_type: "unspecified" as const,
      description: "Build reliable machine learning systems in production.",
      source: "csv" as const,
      source_url: null,
      external_id: "role-1",
      salary_min: null,
      salary_max: null,
      salary_currency: null,
      published_at: null,
      created_at: timestamp,
      updated_at: timestamp,
    },
    application: {
      id: applicationId,
      user_id: "owner-id",
      job_id: jobId,
      status: "saved" as const,
      cv_version_id: null,
      notes: null,
      applied_at: null,
      last_activity_at: timestamp,
      created_at: timestamp,
      updated_at: timestamp,
    },
    events: [{
      id: "40000000-0000-4000-8000-000000000001",
      user_id: "owner-id",
      application_id: applicationId,
      type: "imported" as const,
      title: "Role imported",
      details: null,
      from_status: null,
      to_status: "saved" as const,
      occurred_at: timestamp,
      metadata: { batchId },
      created_at: timestamp,
    }],
  };
}

function collectionQuery(result: { data: unknown; error: unknown }) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn().mockResolvedValue(result),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}

function fluentQuery(result: { data: unknown; error: unknown }) {
  const query = {
    update: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    lt: vi.fn(),
    lte: vi.fn(),
    or: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  query.update.mockReturnValue(query);
  query.insert.mockReturnValue(query);
  query.delete.mockReturnValue(query);
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.lt.mockReturnValue(query);
  query.lte.mockReturnValue(query);
  query.or.mockReturnValue(query);
  return query;
}
