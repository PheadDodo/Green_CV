import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalDataRepository } from "./local-repository";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

describe("LocalDataRepository", () => {
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
});
