import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LocalDataRepository } from "../data/local-repository";
import { SupabaseDataRepository } from "../data/supabase-repository";
import {
  getPublicLlmSettings,
  LlmSettingsConfigurationError,
  LlmSettingsValidationError,
  resolveLlmConfig,
  saveLlmSettings,
} from "./settings";
import type { LlmSettingsInput } from "./types";

vi.mock("server-only", () => ({}));

const temporaryDirectories: string[] = [];
const apiInput: LlmSettingsInput = {
  mode: "api", protocol: "openai", baseUrl: "https://api.example.com/v1",
  model: "chosen-model", apiKey: "private-provider-token",
};
const localInput: LlmSettingsInput = {
  mode: "local", protocol: "ollama", baseUrl: "http://127.0.0.1:11434", model: "local-model",
};

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("OPENAI_MODEL", "");
  vi.stubEnv("LLM_SETTINGS_ENCRYPTION_KEY", "");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })));
});

async function createRepository(userId = "owner-a"): Promise<LocalDataRepository> {
  const directory = await mkdtemp(path.join(tmpdir(), "greencv-llm-"));
  temporaryDirectories.push(directory);
  return new LocalDataRepository({ filePath: path.join(directory, "store.json"), userId });
}

describe("LLM settings", () => {
  it("preserves demo and environment-backed evaluation for pre-settings stores", async () => {
    const repository = await createRepository();
    await repository.listApplications();
    expect(await repository.getLlmSettings()).toBeNull();
    expect(await resolveLlmConfig(repository)).toMatchObject({
      mode: "demo", model: "deterministic-demo-evaluator", apiKey: null,
    });
    expect(await getPublicLlmSettings(repository)).toMatchObject({
      mode: "default", protocol: "openai", model: "gpt-5.4-mini", hasApiKey: false,
    });

    vi.stubEnv("OPENAI_API_KEY", "environment-secret");
    vi.stubEnv("OPENAI_MODEL", "existing-environment-model");
    expect(await resolveLlmConfig(repository)).toMatchObject({
      mode: "api", protocol: "openai-responses", model: "existing-environment-model",
      apiKey: "environment-secret",
    });
    const exposed = await getPublicLlmSettings(repository);
    expect(exposed.hasApiKey).toBe(true);
    expect(JSON.stringify(exposed)).not.toContain("environment-secret");
  });

  it("saves a write-only encrypted key separately from general workspace data", async () => {
    const repository = await createRepository();
    await repository.listApplications();
    const exposed = await saveLlmSettings(repository, apiInput);
    expect(exposed).toMatchObject({ mode: "api", hasApiKey: true, model: apiInput.model });
    expect(exposed).not.toHaveProperty("apiKey");
    expect(exposed).not.toHaveProperty("apiKeyEncrypted");
    const saved = await repository.getLlmSettings();
    expect(saved?.apiKeyEncrypted).toMatch(/^v1:/);
    expect((await resolveLlmConfig(repository)).apiKey).toBe(apiInput.apiKey);

    const reloaded = new LocalDataRepository({ filePath: repository.filePath, userId: repository.userId });
    expect((await resolveLlmConfig(reloaded)).apiKey).toBe(apiInput.apiKey);
    expect(await readFile(repository.filePath, "utf8")).not.toContain("apiKeyEncrypted");
    for (const name of await readdir(path.dirname(repository.filePath))) {
      expect(await readFile(path.join(path.dirname(repository.filePath), name), "utf8"))
        .not.toContain(apiInput.apiKey);
    }
  });

  it("keeps each owner's preferences and encrypted credentials isolated", async () => {
    const owner = await createRepository();
    const other = new LocalDataRepository({ filePath: owner.filePath, userId: "owner-b" });
    await saveLlmSettings(owner, apiInput);
    expect(await other.getLlmSettings()).toBeNull();
    expect((await resolveLlmConfig(other)).mode).toBe("demo");
    await saveLlmSettings(other, localInput);
    expect((await getPublicLlmSettings(owner)).mode).toBe("api");
    expect((await getPublicLlmSettings(other)).mode).toBe("local");

    // Even a copied ciphertext authenticates its owner before decryption.
    const copied = await owner.getLlmSettings();
    await other.saveLlmSettings(copied!);
    await expect(resolveLlmConfig(other)).rejects.toBeInstanceOf(LlmSettingsConfigurationError);
  });

  it("binds encrypted credentials to their provider endpoint even if persistence is modified", async () => {
    const repository = await createRepository();
    await saveLlmSettings(repository, apiInput);
    const saved = await repository.getLlmSettings();
    await repository.saveLlmSettings({ ...saved!, baseUrl: "https://other.example.com/v1" });
    await expect(resolveLlmConfig(repository)).rejects.toBeInstanceOf(LlmSettingsConfigurationError);
  });

  it("initializes one local encryption key and retains all owners under concurrent saves", async () => {
    const repository = await createRepository();
    const owners = Array.from({ length: 8 }, (_, index) => new LocalDataRepository({
      filePath: repository.filePath, userId: "owner-" + index,
    }));
    await Promise.all(owners.map((owner, index) => saveLlmSettings(owner, {
      ...apiInput, apiKey: "private-token-" + index,
    })));
    const configurations = await Promise.all(owners.map((owner) => resolveLlmConfig(owner)));
    expect(configurations.map((config) => config.apiKey))
      .toEqual(owners.map((_, index) => "private-token-" + index));
  });

  it("preserves a key for the same provider endpoint and requires a replacement when it changes", async () => {
    const repository = await createRepository();
    await saveLlmSettings(repository, apiInput);
    await saveLlmSettings(repository, { ...apiInput, model: "new-model", apiKey: "" });
    expect((await resolveLlmConfig(repository)).apiKey).toBe(apiInput.apiKey);

    for (const changed of [
      { ...apiInput, baseUrl: "https://other.example.com/v1", apiKey: "" },
      { ...apiInput, protocol: "anthropic", apiKey: "" },
      { ...apiInput, clearApiKey: true, apiKey: "" },
    ]) {
      await expect(saveLlmSettings(repository, changed)).rejects.toBeInstanceOf(LlmSettingsValidationError);
      expect((await getPublicLlmSettings(repository)).model).toBe("new-model");
    }
    await saveLlmSettings(repository, localInput);
    expect((await resolveLlmConfig(repository)).apiKey).toBeNull();
    await expect(saveLlmSettings(repository, { ...apiInput, apiKey: "" }))
      .rejects.toBeInstanceOf(LlmSettingsValidationError);
  });

  it("allows local models without a key and clears an optional key", async () => {
    const repository = await createRepository();
    await saveLlmSettings(repository, { ...localInput, apiKey: "optional-local-token" });
    expect((await getPublicLlmSettings(repository)).hasApiKey).toBe(true);
    await saveLlmSettings(repository, { ...localInput, clearApiKey: true });
    expect(await resolveLlmConfig(repository)).toMatchObject({ mode: "local", apiKey: null });
    expect((await getPublicLlmSettings(repository)).hasApiKey).toBe(false);
  });

  it("returning to default clears custom credentials and restores the environment", async () => {
    const repository = await createRepository();
    await saveLlmSettings(repository, apiInput);
    await saveLlmSettings(repository, { mode: "default", protocol: "openai", baseUrl: "", model: "" });
    expect((await repository.getLlmSettings())?.apiKeyEncrypted).toBeNull();
    expect((await resolveLlmConfig(repository)).mode).toBe("demo");
  });

  it("changes the cache fingerprint with provider, endpoint, model, or mode", async () => {
    const repository = await createRepository();
    await saveLlmSettings(repository, apiInput);
    const first = await resolveLlmConfig(repository);
    await saveLlmSettings(repository, { ...apiInput, model: "other-model", apiKey: "" });
    expect((await resolveLlmConfig(repository)).fingerprint).not.toBe(first.fingerprint);
    await saveLlmSettings(repository, localInput);
    expect((await resolveLlmConfig(repository)).fingerprint).not.toBe(first.fingerprint);
    expect(first.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(first.fingerprint).not.toContain(apiInput.apiKey);
  });

  it("uses an isolated generated secret for each selected local data store", async () => {
    const first = await createRepository();
    const second = new LocalDataRepository({
      filePath: path.join(path.dirname(first.filePath), "other-store.json"), userId: first.userId,
    });
    await saveLlmSettings(first, apiInput);
    await saveLlmSettings(second, apiInput);
    const firstKey = await readFile(first.filePath + ".llm-settings.key", "utf8");
    const secondKey = await readFile(second.filePath + ".llm-settings.key", "utf8");
    expect(secondKey).not.toBe(firstKey);
  });

  it("requires a valid server encryption key for account-backed or production storage", async () => {
    const repository = new SupabaseDataRepository({ from: vi.fn() } as never, "owner-id");
    vi.spyOn(repository, "getLlmSettings").mockResolvedValue(null);
    await expect(saveLlmSettings(repository, apiInput)).rejects.toBeInstanceOf(LlmSettingsConfigurationError);
    vi.stubEnv("LLM_SETTINGS_ENCRYPTION_KEY", "invalid-key");
    await expect(saveLlmSettings(repository, apiInput)).rejects.toBeInstanceOf(LlmSettingsConfigurationError);

    const local = await createRepository();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LLM_SETTINGS_ENCRYPTION_KEY", "");
    await expect(saveLlmSettings(local, apiInput)).rejects.toBeInstanceOf(LlmSettingsConfigurationError);
  });

  it("uses a configured 32-byte encryption key and fails safely after it changes", async () => {
    const repository = await createRepository();
    vi.stubEnv("LLM_SETTINGS_ENCRYPTION_KEY", Buffer.alloc(32, 1).toString("base64"));
    await saveLlmSettings(repository, apiInput);
    expect((await resolveLlmConfig(repository)).apiKey).toBe(apiInput.apiKey);
    vi.stubEnv("LLM_SETTINGS_ENCRYPTION_KEY", Buffer.alloc(32, 2).toString("base64"));
    await expect(resolveLlmConfig(repository)).rejects.toBeInstanceOf(LlmSettingsConfigurationError);
    expect((await getPublicLlmSettings(repository)).hasApiKey).toBe(true);
  });

  it("rejects tampered ciphertext without leaking credentials", async () => {
    const repository = await createRepository();
    await saveLlmSettings(repository, apiInput);
    const settingsPath = repository.filePath + ".llm-settings.json";
    const document = JSON.parse(await readFile(settingsPath, "utf8"));
    document.settings[0].apiKeyEncrypted = "v1:invalid:invalid:" + apiInput.apiKey;
    await writeFile(settingsPath, JSON.stringify(document));
    try {
      await resolveLlmConfig(repository);
      throw new Error("Expected rejection.");
    } catch (error) {
      expect(error).toBeInstanceOf(LlmSettingsConfigurationError);
      expect((error as Error).message).not.toContain(apiInput.apiKey);
    }
  });

  it.each([
    { mode: "unsupported" },
    { protocol: "unsupported" },
    { model: "" },
    { model: "model\nwith-control" },
    { model: "m".repeat(201) },
    { baseUrl: "file:///private-file" },
    { baseUrl: "http://api.example.com/v1" },
    { baseUrl: "https://user:password@api.example.com/v1" },
    { baseUrl: "https://127.0.0.1/v1" },
    { baseUrl: "u".repeat(2049) },
    { apiKey: "secret\nInjected: header" },
    { apiKey: "k".repeat(4097) },
    { clearApiKey: "true" },
    { clearApiKey: true },
    { apiKeyEncrypted: "plaintext-never-accepted" },
  ])("rejects invalid or unsafe settings without persisting them: %j", async (invalid) => {
    const repository = await createRepository();
    await expect(saveLlmSettings(repository, { ...apiInput, ...invalid }))
      .rejects.toBeInstanceOf(LlmSettingsValidationError);
    expect(await repository.getLlmSettings()).toBeNull();
  });

  it("revalidates a saved local provider before using it in production", async () => {
    const repository = await createRepository();
    await saveLlmSettings(repository, localInput);
    vi.stubEnv("NODE_ENV", "production");
    await expect(resolveLlmConfig(repository)).rejects.toBeInstanceOf(LlmSettingsValidationError);
  });
});
