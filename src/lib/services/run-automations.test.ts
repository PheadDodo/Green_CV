import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LocalDataRepository } from "@/lib/data/local-repository";
import {
  REMINDER_AUTOMATION_RUN_LEASE_MS,
  type AutomationRuleType,
  type JsonObject,
} from "@/lib/data/types";

import { runAutomations } from "./run-automations";

const mocks = vi.hoisted(() => ({
  evaluateApplication: vi.fn(),
}));

vi.mock("./evaluate-application", () => ({
  evaluateApplication: mocks.evaluateApplication,
}));

const temporaryDirectories: string[] = [];

beforeEach(() => {
  mocks.evaluateApplication.mockReset().mockResolvedValue(undefined);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function createRepository(userId: string) {
  const directory = await mkdtemp(path.join(tmpdir(), "greencv-automations-"));
  temporaryDirectories.push(directory);
  return new LocalDataRepository({
    filePath: path.join(directory, "store.json"),
    userId,
  });
}

async function enableOnly(
  repository: LocalDataRepository,
  enabledType: AutomationRuleType,
  config: JsonObject,
) {
  for (const rule of await repository.listAutomationRules()) {
    await repository.upsertAutomationRule({
      id: rule.id,
      type: rule.type,
      enabled: rule.type === enabledType,
      config: rule.type === enabledType ? config : rule.config,
    });
  }
}

async function archiveSeedApplications(repository: LocalDataRepository) {
  for (const application of await repository.listApplications()) {
    await repository.updateApplicationStatus(application.id, "archived");
  }
}

async function createDueFollowUp(repository: LocalDataRepository) {
  await enableOnly(repository, "follow_up", { delayHours: 1 });
  await archiveSeedApplications(repository);
  return repository.createApplication({
    job: {
      title: "Data engineer",
      company: "Concurrency Labs",
      description: "Build reliable data services and production pipelines.",
    },
    application: {
      status: "applied",
      appliedAt: "2020-01-01T00:00:00.000Z",
    },
  });
}

describe("runAutomations reminder execution", () => {
  it("creates one reminder when two workers execute the same due intent simultaneously", async () => {
    const firstWorker = await createRepository("parallel-reminder-user");
    const application = await createDueFollowUp(firstWorker);
    const secondWorker = new LocalDataRepository({
      filePath: firstWorker.filePath,
      userId: firstWorker.userId,
    });

    const results = await Promise.all([
      runAutomations(firstWorker, firstWorker.userId),
      runAutomations(secondWorker, secondWorker.userId),
    ]);

    expect(results.reduce((total, result) => total + result.succeeded, 0)).toBe(1);
    expect(results.reduce((total, result) => total + result.skipped, 0)).toBe(1);
    const runs = await firstWorker.listAutomationRuns({ applicationId: application.id });
    const reminders = (await firstWorker.listReminders()).filter(
      (reminder) => reminder.applicationId === application.id,
    );
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ status: "succeeded", attempts: 1 });
    expect(reminders).toHaveLength(1);
    expect(reminders[0].id).toBe(runs[0].id);
    expect(mocks.evaluateApplication).not.toHaveBeenCalled();
  });

  it("reclaims an expired reminder lease and reuses a reminder created before the worker crashed", async () => {
    const repository = await createRepository("expired-reminder-lease-user");
    const application = await createDueFollowUp(repository);
    const firstResult = await runAutomations(repository, repository.userId);
    const [firstRun] = await repository.listAutomationRuns({ applicationId: application.id });
    const [firstReminder] = (await repository.listReminders()).filter(
      (reminder) => reminder.applicationId === application.id,
    );
    const expiredStartedAt = new Date(
      Date.now() - REMINDER_AUTOMATION_RUN_LEASE_MS - 1,
    ).toISOString();
    await repository.updateAutomationRun(firstRun.id, {
      status: "running",
      startedAt: expiredStartedAt,
      completedAt: null,
    });

    const replay = await runAutomations(repository, repository.userId);

    const [recoveredRun] = await repository.listAutomationRuns({ applicationId: application.id });
    const recoveredReminders = (await repository.listReminders()).filter(
      (reminder) => reminder.applicationId === application.id,
    );
    expect(firstResult).toMatchObject({ succeeded: 1, failed: 0, skipped: 0 });
    expect(replay).toMatchObject({ intents: 1, succeeded: 1, failed: 0, skipped: 0 });
    expect(recoveredRun).toMatchObject({ status: "succeeded", attempts: 2 });
    expect(recoveredReminders).toEqual([firstReminder]);
    expect(mocks.evaluateApplication).not.toHaveBeenCalled();
  });

  it("leaves a fresh running reminder lease with its current worker", async () => {
    const repository = await createRepository("fresh-reminder-lease-user");
    const application = await createDueFollowUp(repository);
    await runAutomations(repository, repository.userId);
    const [run] = await repository.listAutomationRuns({ applicationId: application.id });
    await repository.updateAutomationRun(run.id, {
      status: "running",
      startedAt: new Date().toISOString(),
      completedAt: null,
    });

    const replay = await runAutomations(repository, repository.userId);

    const [leasedRun] = await repository.listAutomationRuns({ applicationId: application.id });
    const reminders = (await repository.listReminders()).filter(
      (reminder) => reminder.applicationId === application.id,
    );
    expect(replay).toMatchObject({ intents: 1, succeeded: 0, failed: 0, skipped: 1 });
    expect(leasedRun).toMatchObject({ status: "running", attempts: 1 });
    expect(reminders).toHaveLength(1);
    expect(mocks.evaluateApplication).not.toHaveBeenCalled();
  });

  it("skips reminder work when another worker wins the claim", async () => {
    const repository = await createRepository("lost-claim-user");
    const application = await createDueFollowUp(repository);
    const claim = vi.spyOn(repository, "claimAutomationRun").mockResolvedValue(null);
    const ensureReminder = vi.spyOn(repository, "ensureAutomationReminder");

    const result = await runAutomations(repository, repository.userId);

    expect(result).toMatchObject({ intents: 1, succeeded: 0, failed: 0, skipped: 1 });
    expect(claim).toHaveBeenCalledTimes(1);
    expect(ensureReminder).not.toHaveBeenCalled();
    expect(await repository.listAutomationRuns({ applicationId: application.id })).toEqual([
      expect.objectContaining({ status: "pending", attempts: 0 }),
    ]);
    expect(
      (await repository.listReminders()).filter(
        (reminder) => reminder.applicationId === application.id,
      ),
    ).toHaveLength(0);
  });

  it("skips a run cancelled while it is waiting to be claimed and skips it on replay", async () => {
    const repository = await createRepository("cancelled-run-user");
    const application = await createDueFollowUp(repository);
    const ensureReminder = vi.spyOn(repository, "ensureAutomationReminder");
    const firstClaim = vi
      .spyOn(repository, "claimAutomationRun")
      .mockImplementation(async (id) => {
        await repository.cancelAutomationRun(id);
        return null;
      });

    const firstResult = await runAutomations(repository, repository.userId);
    expect(firstResult).toMatchObject({ intents: 1, succeeded: 0, failed: 0, skipped: 1 });
    expect(firstClaim).toHaveBeenCalledTimes(1);
    firstClaim.mockRestore();

    const replayClaim = vi.spyOn(repository, "claimAutomationRun");
    const replayResult = await runAutomations(repository, repository.userId);

    expect(replayResult).toMatchObject({ intents: 1, succeeded: 0, failed: 0, skipped: 1 });
    expect(replayClaim).not.toHaveBeenCalled();
    expect(ensureReminder).not.toHaveBeenCalled();
    expect(await repository.listAutomationRuns({ applicationId: application.id })).toEqual([
      expect.objectContaining({ status: "cancelled", attempts: 0 }),
    ]);
  });

  it("preserves automatic evaluation execution", async () => {
    const repository = await createRepository("evaluation-regression-user");
    await enableOnly(repository, "auto_evaluate", { minimumDescriptionLength: 40 });
    await archiveSeedApplications(repository);
    const cv = (await repository.listCvVersions())[0];
    const application = await repository.createApplication({
      job: {
        title: "Machine learning engineer",
        company: "Evaluation Labs",
        description:
          "Build, test, and operate machine learning systems with measurable product outcomes.",
      },
      application: {
        status: "saved",
        cvVersionId: cv.id,
      },
    });

    const result = await runAutomations(repository, repository.userId);

    expect(result).toMatchObject({ intents: 1, succeeded: 1, failed: 0, skipped: 0 });
    expect(mocks.evaluateApplication).toHaveBeenCalledOnce();
    expect(mocks.evaluateApplication).toHaveBeenCalledWith(repository, application.id);
    expect(await repository.listAutomationRuns({ applicationId: application.id })).toEqual([
      expect.objectContaining({ type: "auto_evaluate", status: "succeeded", attempts: 1 }),
    ]);
  });
});
