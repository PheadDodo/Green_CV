import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LlmSettings } from "../llm/types";
import { LocalDataRepository } from "./local-repository";
import { SupabaseDataRepository } from "./supabase-repository";

const settings: LlmSettings = {
  mode: "local", protocol: "ollama", baseUrl: "http://127.0.0.1:11434",
  model: "chosen-local-model", apiKeyEncrypted: null, updatedAt: "2026-10-08T12:00:00.000Z",
};
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })));
});

function queryResult(data: unknown) {
  const query = {
    select: vi.fn(), eq: vi.fn(), upsert: vi.fn(), insert: vi.fn(), update: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
    single: vi.fn().mockResolvedValue({ data, error: null }),
  };
  for (const operation of [query.select, query.eq, query.upsert, query.insert, query.update]) {
    operation.mockReturnValue(query);
  }
  return query;
}

function settingsRow(userId = "owner-id") {
  return {
    user_id: userId, mode: settings.mode, protocol: settings.protocol,
    base_url: settings.baseUrl, model: settings.model,
    api_key_encrypted: settings.apiKeyEncrypted, updated_at: settings.updatedAt,
  };
}

function evaluationRow() {
  return {
    id: "evaluation-id", user_id: "owner-id", application_id: "application-id", job_id: "job-id",
    cv_version_id: null, status: "running", recommendation: null, overall_score: null,
    summary: null, strengths: [], gaps: [], evidence: [], suggested_edits: [],
    model: settings.model, prompt_version: "v1", error_message: null,
    provider_mode: "local", provider_fingerprint: "a".repeat(64),
    created_at: settings.updatedAt, updated_at: settings.updatedAt, completed_at: null,
  };
}

describe("Supabase LLM settings ownership", () => {
  it("looks up only the repository owner's settings and maps private ciphertext explicitly", async () => {
    const query = queryResult(settingsRow());
    const from = vi.fn().mockReturnValue(query);
    const repository = new SupabaseDataRepository({ from } as never, "owner-id");

    expect(await repository.getLlmSettings()).toEqual(settings);
    expect(from).toHaveBeenCalledWith("llm_settings");
    expect(query.eq).toHaveBeenCalledWith("user_id", "owner-id");
  });

  it("does not return a foreign record even if the backend violates the owner filter", async () => {
    const query = queryResult(settingsRow("foreign-owner"));
    const repository = new SupabaseDataRepository({ from: vi.fn().mockReturnValue(query) } as never, "owner-id");
    expect(await repository.getLlmSettings()).toBeNull();
  });

  it("upserts exactly one owner's settings and never accepts an owner from the input", async () => {
    const query = queryResult(settingsRow());
    const repository = new SupabaseDataRepository({ from: vi.fn().mockReturnValue(query) } as never, "owner-id");

    expect(await repository.saveLlmSettings({ ...settings, userId: "foreign-owner" } as LlmSettings))
      .toEqual(settings);
    expect(query.upsert).toHaveBeenCalledWith(settingsRow(), { onConflict: "user_id" });
    expect(query.eq).toHaveBeenCalledWith("user_id", "owner-id");
  });

  it("rejects a saved result returned for another owner", async () => {
    const query = queryResult(settingsRow("foreign-owner"));
    const repository = new SupabaseDataRepository({ from: vi.fn().mockReturnValue(query) } as never, "owner-id");
    await expect(repository.saveLlmSettings(settings)).rejects.toThrow("did not return");
  });
});

describe("evaluation provider metadata persistence", () => {
  it("preserves historical local evaluations and stores metadata on new reservations and updates", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "greencv-llm-metadata-"));
    temporaryDirectories.push(directory);
    const repository = new LocalDataRepository({ filePath: path.join(directory, "store.json") });
    const application = (await repository.listApplications())[0];
    const historical = await repository.listEvaluations();
    expect(historical[0].providerMode).toBeUndefined();

    const evaluation = await repository.createEvaluation({
      applicationId: application.id, status: "running", providerMode: "local",
      providerFingerprint: "a".repeat(64),
    });
    expect(evaluation).toMatchObject({ providerMode: "local", providerFingerprint: "a".repeat(64) });
    await repository.updateEvaluation(evaluation.id, { providerMode: "api", providerFingerprint: "b".repeat(64) });
    expect(await repository.getEvaluation(evaluation.id)).toMatchObject({
      providerMode: "api", providerFingerprint: "b".repeat(64),
    });
  });

  it("maps Supabase provider metadata for lookup, new reservations, and updates", async () => {
    const query = queryResult(evaluationRow());
    const repository = new SupabaseDataRepository({ from: vi.fn().mockReturnValue(query) } as never, "owner-id");
    expect(await repository.getEvaluation("evaluation-id")).toMatchObject({
      providerMode: "local", providerFingerprint: "a".repeat(64),
    });
    vi.spyOn(repository, "getApplication").mockResolvedValue({
      id: "application-id", jobId: "job-id", cvVersionId: null,
    } as never);
    await repository.createEvaluation({ applicationId: "application-id", providerMode: "local",
      providerFingerprint: "a".repeat(64) });
    expect(query.insert).toHaveBeenCalledWith(expect.objectContaining({
      provider_mode: "local", provider_fingerprint: "a".repeat(64),
    }));
    await repository.updateEvaluation("evaluation-id", { providerMode: "local", providerFingerprint: "a".repeat(64) });
    expect(query.update).toHaveBeenCalledWith({ provider_mode: "local", provider_fingerprint: "a".repeat(64) });
    expect(query.eq).toHaveBeenCalledWith("user_id", "owner-id");
  });
});
