import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalDataRepository } from "./local-repository";
import { REMINDER_AUTOMATION_RUN_LEASE_MS } from "./types";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

describe("LocalDataRepository", () => {
  it("creates local private-data paths with owner-only permissions where supported", async () => {
    if (process.platform === "win32") return;
    const directory = await mkdtemp(path.join(tmpdir(), "greencv-store-"));
    temporaryDirectories.push(directory);
    const privateDirectory = path.join(directory, "private");
    const filePath = path.join(privateDirectory, "store.json");
    const repository = new LocalDataRepository({ filePath });

    await repository.listApplications();

    expect((await stat(privateDirectory)).mode & 0o777).toBe(0o700);
    expect((await stat(filePath)).mode & 0o777).toBe(0o600);
  });

  it("initializes one valid store under concurrent first reads", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "greencv-store-"));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, "store.json");
    const repositories = Array.from({ length: 16 }, () => new LocalDataRepository({ filePath }));
    const results = await Promise.all(repositories.map(repository => repository.listApplications()));
    expect(results.every(applications => applications.length === results[0].length)).toBe(true);
    const persisted = await readFile(filePath, "utf8");
    expect(() => JSON.parse(persisted)).not.toThrow();
  });

  it("persists a status transition across repository instances", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "greencv-store-"));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, "store.json");
    const first = new LocalDataRepository({ filePath });
    const application = (await first.listApplications())[0];
    await first.updateApplicationStatus(application.id, "screening", "Recruiter replied");
    const second = new LocalDataRepository({ filePath });
    const reloaded = await second.getApplication(application.id);
    expect(reloaded?.status).toBe("screening");
    expect(reloaded?.events[0]?.details).toBe("Recruiter replied");
  });

  it("keeps a captured job snapshot immutable", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "greencv-store-"));
    temporaryDirectories.push(directory);
    const repository = new LocalDataRepository({ filePath: path.join(directory, "store.json") });
    const job = (await repository.listJobs())[0];

    await expect(repository.updateJob(job.id, { description: "Rewritten evidence" }))
      .rejects.toThrow(/immutable/i);
    expect((await repository.getJob(job.id))?.description).toBe(job.description);
  });

  it("keeps imported CV content immutable", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "greencv-store-"));
    temporaryDirectories.push(directory);
    const repository = new LocalDataRepository({ filePath: path.join(directory, "store.json") });
    const cv = (await repository.listCvVersions())[0];

    await expect(repository.updateCvVersion(cv.id, { content: "Rewritten CV evidence" } as never))
      .rejects.toThrow(/immutable/i);
    expect((await repository.getCvVersion(cv.id))?.content).toBe(cv.content);
  });

  it("leaves every CV unselected when the default is explicitly unselected", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "greencv-store-"));
    temporaryDirectories.push(directory);
    const repository = new LocalDataRepository({ filePath: path.join(directory, "store.json") });
    const cvs = await repository.listCvVersions();
    const selectedCv = cvs.find(cv => cv.isDefault);
    expect(selectedCv).toBeTruthy();
    expect(cvs.length).toBeGreaterThan(1);

    await repository.updateCvVersion(selectedCv!.id, { isDefault: false });

    expect((await repository.listCvVersions()).every(cv => !cv.isDefault)).toBe(true);
  });

  it("deletes an owned CV and detaches preserved application history", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "greencv-store-"));
    temporaryDirectories.push(directory);
    const repository = new LocalDataRepository({ filePath: path.join(directory, "store.json") });
    const evaluation = (await repository.listEvaluations()).find(item => item.cvVersionId !== null);
    expect(evaluation).toBeTruthy();
    const cvId = evaluation!.cvVersionId!;
    const application = await repository.getApplication(evaluation!.applicationId);
    expect(application?.cvVersionId).toBe(cvId);

    await repository.deleteCvVersion(cvId);

    expect(await repository.getCvVersion(cvId)).toBeNull();
    const detachedApplication = await repository.getApplication(application!.id);
    const detachedEvaluation = await repository.getEvaluation(evaluation!.id);
    expect(detachedApplication?.cvVersionId).toBeNull();
    expect(detachedApplication?.updatedAt).not.toBe(application!.updatedAt);
    expect(detachedEvaluation?.cvVersionId).toBeNull();
    expect(detachedEvaluation?.updatedAt).not.toBe(evaluation!.updatedAt);
  });

  it("does not delete a CV owned by another user", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "greencv-store-"));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, "store.json");
    const owner = new LocalDataRepository({ filePath, userId: "owner-a" });
    const otherUser = new LocalDataRepository({ filePath, userId: "owner-b" });
    const foreignCv = await otherUser.createCvVersion({ name: "Private CV", content: "Private evidence" });

    await expect(owner.deleteCvVersion(foreignCv.id)).rejects.toThrow(/not found/i);
    expect(await otherUser.getCvVersion(foreignCv.id)).toEqual(foreignCv);
  });

  it("deletes an owned application aggregate while preserving reusable CV and run history", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "greencv-store-"));
    temporaryDirectories.push(directory);
    const repository = new LocalDataRepository({ filePath: path.join(directory, "store.json") });
    const application = (await repository.listApplications()).find(item =>
      item.events.length > 0 && item.latestEvaluation !== null,
    );
    expect(application).toBeTruthy();
    const cvId = application!.cvVersionId;
    const jobId = application!.jobId;
    const run = (await repository.listAutomationRuns({ applicationId: application!.id }))[0];
    expect(cvId).toBeTruthy();
    expect(run).toBeTruthy();

    await repository.deleteApplication(application!.id);

    expect(await repository.getApplication(application!.id)).toBeNull();
    expect(await repository.getJob(jobId)).toBeNull();
    expect((await repository.listEvaluations()).some(item => item.applicationId === application!.id))
      .toBe(false);
    expect((await repository.listReminders(true)).some(item => item.applicationId === application!.id))
      .toBe(false);
    expect(await repository.getCvVersion(cvId!)).not.toBeNull();
    expect((await repository.listAutomationRuns()).find(item => item.id === run.id)?.applicationId)
      .toBeNull();
  });

  it("does not delete an application owned by another user", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "greencv-store-"));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, "store.json");
    const owner = new LocalDataRepository({ filePath, userId: "owner-a" });
    const otherUser = new LocalDataRepository({ filePath, userId: "owner-b" });
    const foreignApplication = await otherUser.createApplication({
      job: {
        title: "Private role",
        company: "Private company",
        description: "Private role information that belongs only to the other user.",
      },
    });

    await expect(owner.deleteApplication(foreignApplication.id)).rejects.toThrow(/not found/i);
    expect(await otherUser.getApplication(foreignApplication.id)).not.toBeNull();
    expect(await otherUser.getJob(foreignApplication.jobId)).not.toBeNull();
  });

  it("retains an audited failed import batch when every row is rejected", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "greencv-store-"));
    temporaryDirectories.push(directory);
    const repository = new LocalDataRepository({ filePath: path.join(directory, "store.json") });
    const duplicateJob = {
      title: "Imported role",
      company: "Northstar",
      description: "A sufficiently detailed imported role description for this regression test.",
      source: "csv" as const,
      externalId: "duplicate-external-id",
    };
    await repository.createApplication({ job: duplicateJob });
    const batch = await repository.createImportBatch({
      source: "csv",
      fileName: "duplicates.csv",
      totalRows: 1,
      status: "processing",
    });

    const result = await repository.bulkCreateApplications([{ job: duplicateJob }], batch.id);
    const persisted = (await repository.listImportBatches()).find(item => item.id === batch.id);

    expect(result.applications).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(persisted).toMatchObject({
      status: "failed",
      totalRows: 1,
      processedRows: 1,
      succeededRows: 0,
      failedRows: 1,
      errors: result.errors,
    });
    expect(persisted?.completedAt).not.toBeNull();
  });

  it("creates one imported aggregate and classifies its batch row once", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "greencv-store-"));
    temporaryDirectories.push(directory);
    const repository = new LocalDataRepository({ filePath: path.join(directory, "store.json") });
    const batch = await repository.createImportBatch({
      source: "csv",
      fileName: "one-role.csv",
      totalRows: 1,
      status: "processing",
    });

    const result = await repository.bulkCreateApplications([{
      job: {
        title: "Platform Engineer",
        company: "Northstar",
        description: "Build reliable infrastructure for production machine learning systems.",
        source: "csv",
      },
    }], batch.id);
    const persisted = (await repository.listImportBatches()).find(item => item.id === batch.id);

    expect(result.errors).toEqual([]);
    expect(result.applications).toHaveLength(1);
    expect(result.applications[0].events).toEqual([
      expect.objectContaining({
        type: "imported",
        title: "Role imported",
        metadata: { batchId: batch.id },
      }),
    ]);
    expect(persisted).toMatchObject({
      status: "completed",
      totalRows: 1,
      processedRows: 1,
      succeededRows: 1,
      failedRows: 0,
    });
  });

  it("deletes an import audit batch without deleting its imported applications", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "greencv-store-"));
    temporaryDirectories.push(directory);
    const repository = new LocalDataRepository({ filePath: path.join(directory, "store.json") });
    const batch = await repository.createImportBatch({
      source: "csv",
      fileName: "private-history.csv",
      totalRows: 1,
      status: "processing",
    });
    const result = await repository.bulkCreateApplications([{
      job: {
        title: "Privacy Engineer",
        company: "Northstar",
        description: "Build privacy-preserving systems for job-search records.",
        source: "csv",
      },
    }], batch.id);
    const importedApplication = result.applications[0];

    await repository.deleteImportBatch(batch.id);

    expect((await repository.listImportBatches()).some(item => item.id === batch.id)).toBe(false);
    expect(await repository.getApplication(importedApplication.id)).toMatchObject({
      id: importedApplication.id,
      events: [expect.objectContaining({ metadata: { batchId: batch.id } })],
    });
  });

  it("does not delete an import audit batch owned by another user", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "greencv-store-"));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, "store.json");
    const owner = new LocalDataRepository({ filePath, userId: "owner-a" });
    const otherUser = new LocalDataRepository({ filePath, userId: "owner-b" });
    const foreignBatch = await otherUser.createImportBatch({
      source: "csv",
      fileName: "other-user.csv",
    });

    await expect(owner.deleteImportBatch(foreignBatch.id)).rejects.toThrow(/not found/i);
    expect(await otherUser.listImportBatches()).toContainEqual(foreignBatch);
  });

  it("dismisses a reminder while retaining it in history", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "greencv-store-"));
    temporaryDirectories.push(directory);
    const repository = new LocalDataRepository({ filePath: path.join(directory, "store.json") });
    const reminder = (await repository.listReminders())[0];

    const dismissed = await repository.dismissReminder(reminder.id);

    expect(dismissed.status).toBe("dismissed");
    expect(dismissed.completedAt).toBeNull();
    expect((await repository.listReminders()).some(item => item.id === reminder.id)).toBe(false);
    expect((await repository.listReminders(true)).find(item => item.id === reminder.id)?.status)
      .toBe("dismissed");
  });

  it("does not dismiss a reminder owned by another user", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "greencv-store-"));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, "store.json");
    const owner = new LocalDataRepository({ filePath, userId: "owner-a" });
    const otherUser = new LocalDataRepository({ filePath, userId: "owner-b" });
    const foreignReminder = await otherUser.upsertReminder({
      title: "Private reminder",
      dueAt: "2026-09-03T09:00:00.000Z",
    });

    await expect(owner.dismissReminder(foreignReminder.id)).rejects.toThrow(/not found/i);
    expect((await otherUser.listReminders()).find(item => item.id === foreignReminder.id)?.status)
      .toBe("pending");
  });

  it("keeps the first terminal reminder transition when another action races it", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "greencv-store-"));
    temporaryDirectories.push(directory);
    const repository = new LocalDataRepository({ filePath: path.join(directory, "store.json") });
    const reminder = (await repository.listReminders())[0];

    const completed = await repository.completeReminder(reminder.id);
    const replayedCompletion = await repository.completeReminder(reminder.id);
    await expect(repository.dismissReminder(reminder.id)).rejects.toThrow(/not found/i);

    const retained = (await repository.listReminders(true)).find(item => item.id === reminder.id);
    expect(retained?.status).toBe("completed");
    expect(replayedCompletion.completedAt).toBe(completed.completedAt);
    expect(retained?.completedAt).toBe(completed.completedAt);
  });

  it("claims a due automation run once with an attempts compare-and-set", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "greencv-store-"));
    temporaryDirectories.push(directory);
    const repository = new LocalDataRepository({ filePath: path.join(directory, "store.json") });
    const application = (await repository.listApplications())[0];
    const rule = (await repository.listAutomationRules()).find(item => item.type === "follow_up");
    const run = await repository.createAutomationRun({
      ruleId: rule!.id,
      applicationId: application.id,
      type: "follow_up",
      idempotencyKey: "follow-up-claim",
      scheduledAt: "2026-09-04T08:00:00.000Z",
    });

    const claimed = await repository.claimAutomationRun(run.id, {
      expectedAttempts: 0,
      startedAt: "2026-09-04T08:00:01.000Z",
    });
    const losingClaim = await repository.claimAutomationRun(run.id, {
      expectedAttempts: 0,
      startedAt: "2026-09-04T08:00:02.000Z",
    });

    expect(claimed).toMatchObject({
      status: "running",
      attempts: 1,
      startedAt: "2026-09-04T08:00:01.000Z",
      completedAt: null,
      errorMessage: null,
    });
    expect(losingClaim).toBeNull();
    expect(await repository.getAutomationRun(run.id)).toEqual(claimed);
  });

  it("reclaims a reminder run only after its worker lease expires", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "greencv-store-"));
    temporaryDirectories.push(directory);
    const repository = new LocalDataRepository({ filePath: path.join(directory, "store.json") });
    const application = (await repository.listApplications())[0];
    const rule = (await repository.listAutomationRules()).find(item => item.type === "follow_up");
    const run = await repository.createAutomationRun({
      ruleId: rule!.id,
      applicationId: application.id,
      type: "follow_up",
      idempotencyKey: "follow-up-worker-lease",
      scheduledAt: "2026-09-04T08:00:00.000Z",
    });
    const firstStartedAt = Date.parse("2026-09-04T08:00:01.000Z");

    const firstClaim = await repository.claimAutomationRun(run.id, {
      expectedAttempts: 0,
      startedAt: new Date(firstStartedAt).toISOString(),
    });
    const freshClaim = await repository.claimAutomationRun(run.id, {
      expectedAttempts: 1,
      startedAt: new Date(firstStartedAt + REMINDER_AUTOMATION_RUN_LEASE_MS - 1).toISOString(),
    });
    const reclaimed = await repository.claimAutomationRun(run.id, {
      expectedAttempts: 1,
      startedAt: new Date(firstStartedAt + REMINDER_AUTOMATION_RUN_LEASE_MS).toISOString(),
    });

    expect(firstClaim).toMatchObject({ status: "running", attempts: 1 });
    expect(freshClaim).toBeNull();
    expect(reclaimed).toMatchObject({
      status: "running",
      attempts: 2,
      startedAt: new Date(firstStartedAt + REMINDER_AUTOMATION_RUN_LEASE_MS).toISOString(),
    });
  });

  it("never applies the reminder lease recovery policy to evaluation runs", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "greencv-store-"));
    temporaryDirectories.push(directory);
    const repository = new LocalDataRepository({ filePath: path.join(directory, "store.json") });
    const application = (await repository.listApplications())[0];
    const rule = (await repository.listAutomationRules()).find(item => item.type === "auto_evaluate");
    const run = await repository.createAutomationRun({
      ruleId: rule!.id,
      applicationId: application.id,
      type: "auto_evaluate",
      idempotencyKey: "evaluation-with-expired-start-time",
      status: "running",
      attempts: 1,
      startedAt: "2020-01-01T00:00:00.000Z",
      scheduledAt: "2020-01-01T00:00:00.000Z",
    });

    const claimed = await repository.claimAutomationRun(run.id, {
      expectedAttempts: 1,
      startedAt: "2026-09-04T08:00:00.000Z",
    });

    expect(claimed).toBeNull();
    expect(await repository.getAutomationRun(run.id)).toEqual(run);
  });

  it("does not claim automation work before its scheduled instant", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "greencv-store-"));
    temporaryDirectories.push(directory);
    const repository = new LocalDataRepository({ filePath: path.join(directory, "store.json") });
    const application = (await repository.listApplications())[0];
    const rule = (await repository.listAutomationRules()).find(item => item.type === "interview_prep");
    const run = await repository.createAutomationRun({
      ruleId: rule!.id,
      applicationId: application.id,
      type: "interview_prep",
      idempotencyKey: "interview-prep-not-due",
      scheduledAt: "2026-09-04T09:00:00.000Z",
    });

    expect(await repository.claimAutomationRun(run.id, {
      expectedAttempts: 0,
      startedAt: "2026-09-04T08:59:59.000Z",
    })).toBeNull();
    expect(await repository.getAutomationRun(run.id)).toEqual(run);
  });

  it("cancels retryable automation idempotently without rewriting terminal history", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "greencv-store-"));
    temporaryDirectories.push(directory);
    const repository = new LocalDataRepository({ filePath: path.join(directory, "store.json") });
    const application = (await repository.listApplications())[0];
    const rule = (await repository.listAutomationRules()).find(item => item.type === "follow_up");
    const retry = await repository.createAutomationRun({
      ruleId: rule!.id,
      applicationId: application.id,
      type: "follow_up",
      idempotencyKey: "follow-up-retry",
      status: "failed",
      attempts: 2,
    });

    const cancelled = await repository.cancelAutomationRun(retry.id);
    const replayed = await repository.cancelAutomationRun(retry.id);

    expect(cancelled).toMatchObject({ status: "cancelled", attempts: 2 });
    expect(cancelled.completedAt).not.toBeNull();
    expect(replayed).toEqual(cancelled);
  });

  it("rejects cancellation after automation starts or exhausts its attempts", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "greencv-store-"));
    temporaryDirectories.push(directory);
    const repository = new LocalDataRepository({ filePath: path.join(directory, "store.json") });
    const application = (await repository.listApplications())[0];
    const rule = (await repository.listAutomationRules()).find(item => item.type === "interview_prep");
    const running = await repository.createAutomationRun({
      ruleId: rule!.id,
      applicationId: application.id,
      type: "interview_prep",
      idempotencyKey: "interview-prep-running",
      status: "running",
      attempts: 1,
    });
    const exhausted = await repository.createAutomationRun({
      ruleId: rule!.id,
      applicationId: application.id,
      type: "interview_prep",
      idempotencyKey: "interview-prep-exhausted",
      status: "failed",
      attempts: 4,
    });

    await expect(repository.cancelAutomationRun(running.id)).rejects.toThrow(/cannot be cancelled/i);
    await expect(repository.cancelAutomationRun(exhausted.id)).rejects.toThrow(/cannot be cancelled/i);
  });

  it("creates one deterministic reminder per automation run and never reopens it", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "greencv-store-"));
    temporaryDirectories.push(directory);
    const repository = new LocalDataRepository({ filePath: path.join(directory, "store.json") });
    const application = (await repository.listApplications())[0];
    const rule = (await repository.listAutomationRules()).find(item => item.type === "follow_up");
    const run = await repository.createAutomationRun({
      ruleId: rule!.id,
      applicationId: application.id,
      type: "follow_up",
      idempotencyKey: "follow-up-reminder-once",
      status: "running",
      attempts: 1,
    });
    const input = {
      applicationId: application.id,
      title: "Follow up with Northstar",
      notes: "Ask about the role.",
      dueAt: "2026-09-05T08:00:00.000Z",
    };

    const created = await repository.ensureAutomationReminder(run.id, input);
    const replayed = await repository.ensureAutomationReminder(run.id, input);
    const completed = await repository.completeReminder(created.id);
    const afterCompletion = await repository.ensureAutomationReminder(run.id, input);

    expect(created.id).toBe(run.id);
    expect(replayed).toEqual(created);
    expect(afterCompletion).toEqual(completed);
    expect((await repository.listReminders(true)).filter(item => item.id === run.id)).toHaveLength(1);
  });
});
