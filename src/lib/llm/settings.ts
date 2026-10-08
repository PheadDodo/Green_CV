import "server-only";

import { createHash } from "node:crypto";

import type { DataRepository } from "../data/repository";
import { validateLlmBaseUrl } from "./http";
import { decryptLlmApiKey, encryptLlmApiKey } from "./secrets";
import type { LlmSettings, LlmSettingsInput, PublicLlmSettings, ResolvedLlmConfig } from "./types";

export { LlmSettingsConfigurationError } from "./secrets";
export type { LlmSettingsInput, PublicLlmSettings, ResolvedLlmConfig } from "./types";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-5.4-mini";
const DEMO_MODEL = "deterministic-demo-evaluator";

export class LlmSettingsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmSettingsValidationError";
  }
}

function validateInput(value: unknown): LlmSettingsInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new LlmSettingsValidationError("Provide LLM settings as an object.");
  }
  const input = value as Record<string, unknown>;
  const allowedFields = new Set(["mode", "protocol", "baseUrl", "model", "apiKey", "clearApiKey"]);
  if (Object.keys(input).some((field) => !allowedFields.has(field))) {
    throw new LlmSettingsValidationError("The LLM settings contain an unsupported field.");
  }
  if (!["default", "api", "local"].includes(input.mode as string)) {
    throw new LlmSettingsValidationError("Select the default, API, or local mode.");
  }
  if (!["openai", "anthropic", "ollama"].includes(input.protocol as string)) {
    throw new LlmSettingsValidationError("Select a supported LLM API protocol.");
  }
  if (typeof input.baseUrl !== "string" || input.baseUrl.length > 2048) {
    throw new LlmSettingsValidationError("The server URL must be at most 2048 characters.");
  }
  if (typeof input.model !== "string" || input.model.length > 200 || /[\u0000-\u001f\u007f]/u.test(input.model)) {
    throw new LlmSettingsValidationError("The model name must be at most 200 characters without control characters.");
  }
  if (
    input.apiKey !== undefined &&
    (typeof input.apiKey !== "string" || input.apiKey.length > 4096 ||
      /[\u0000-\u001f\u007f]/u.test(input.apiKey) ||
      (input.apiKey.trim() !== "" && !/^[\x21-\x7e]+$/u.test(input.apiKey.trim())))
  ) {
    throw new LlmSettingsValidationError("The API key must be at most 4096 characters without spaces or control characters.");
  }
  if (input.clearApiKey !== undefined && typeof input.clearApiKey !== "boolean") {
    throw new LlmSettingsValidationError("The clear API key option must be true or false.");
  }
  if (input.clearApiKey && typeof input.apiKey === "string" && input.apiKey.trim()) {
    throw new LlmSettingsValidationError("Choose either a replacement API key or clear the saved key.");
  }
  const parsed: LlmSettingsInput = {
    mode: input.mode as LlmSettingsInput["mode"],
    protocol: input.protocol as LlmSettingsInput["protocol"],
    baseUrl: input.baseUrl.trim(),
    model: input.model.trim(),
    apiKey: typeof input.apiKey === "string" ? input.apiKey.trim() : undefined,
    clearApiKey: input.clearApiKey as boolean | undefined,
  };
  if (parsed.mode !== "default") {
    if (!parsed.model) throw new LlmSettingsValidationError("Enter a model name.");
    try {
      parsed.baseUrl = validateLlmBaseUrl(parsed.mode, parsed.baseUrl);
    } catch (error) {
      throw new LlmSettingsValidationError(
        error instanceof Error ? error.message : "Enter a valid LLM server URL.",
      );
    }
  }
  return parsed;
}

function defaultSettings(updatedAt: string | null = null): LlmSettings {
  return {
    mode: "default",
    protocol: "openai",
    baseUrl: DEFAULT_BASE_URL,
    model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
    apiKeyEncrypted: null,
    updatedAt,
  };
}

function toPublic(settings: LlmSettings): PublicLlmSettings {
  // Enumerate safe fields explicitly rather than spreading a secret-bearing record.
  return {
    mode: settings.mode,
    protocol: settings.protocol,
    baseUrl: settings.baseUrl,
    model: settings.model,
    hasApiKey: settings.mode === "default"
      ? Boolean(process.env.OPENAI_API_KEY)
      : Boolean(settings.apiKeyEncrypted),
    updatedAt: settings.updatedAt,
  };
}

export async function getPublicLlmSettings(repository: DataRepository): Promise<PublicLlmSettings> {
  const saved = await repository.getLlmSettings();
  return toPublic(!saved || saved.mode === "default" ? defaultSettings(saved?.updatedAt) : saved);
}

export async function saveLlmSettings(
  repository: DataRepository,
  value: unknown,
): Promise<PublicLlmSettings> {
  const input = validateInput(value);
  const timestamp = new Date().toISOString();
  if (input.mode === "default") {
    return toPublic(await repository.saveLlmSettings(defaultSettings(timestamp)));
  }
  const previous = await repository.getLlmSettings();
  const sameEndpoint = previous?.mode === input.mode && previous.protocol === input.protocol &&
    previous.baseUrl === input.baseUrl;
  let apiKeyEncrypted = sameEndpoint && !input.clearApiKey
    ? previous?.apiKeyEncrypted ?? null : null;
  if (input.apiKey) apiKeyEncrypted = await encryptLlmApiKey(repository, input.apiKey, input);
  if (input.mode === "api" && !apiKeyEncrypted) {
    throw new LlmSettingsValidationError(
      "Enter an API key for this provider and server URL before saving API mode.",
    );
  }
  return toPublic(await repository.saveLlmSettings({
    mode: input.mode,
    protocol: input.protocol,
    baseUrl: input.baseUrl,
    model: input.model,
    apiKeyEncrypted,
    updatedAt: timestamp,
  }));
}

function withFingerprint(
  config: Omit<ResolvedLlmConfig, "fingerprint">,
): ResolvedLlmConfig {
  const fingerprint = createHash("sha256").update(JSON.stringify({
    version: 1,
    mode: config.mode,
    protocol: config.protocol,
    baseUrl: config.baseUrl,
    model: config.model,
  })).digest("hex");
  return { ...config, fingerprint };
}

export async function resolveLlmConfig(repository: DataRepository): Promise<ResolvedLlmConfig> {
  const saved = await repository.getLlmSettings();
  if (!saved || saved.mode === "default") {
    const apiKey = process.env.OPENAI_API_KEY || null;
    return withFingerprint(apiKey ? {
      mode: "api", protocol: "openai-responses", baseUrl: DEFAULT_BASE_URL,
      model: process.env.OPENAI_MODEL || DEFAULT_MODEL, apiKey,
    } : {
      mode: "demo", protocol: "openai", baseUrl: "", model: DEMO_MODEL, apiKey: null,
    });
  }
  // Revalidate persisted settings when deployment rules change (especially local
  // mode in production), before any secret or user evidence reaches a provider.
  const input = validateInput({
    mode: saved.mode, protocol: saved.protocol, baseUrl: saved.baseUrl, model: saved.model,
  });
  const apiKey = saved.apiKeyEncrypted
    ? await decryptLlmApiKey(repository, saved.apiKeyEncrypted, input) : null;
  if (saved.mode === "api" && !apiKey) {
    throw new LlmSettingsValidationError("The selected API provider needs an API key.");
  }
  return withFingerprint({
    mode: saved.mode, protocol: saved.protocol, baseUrl: input.baseUrl, model: input.model, apiKey,
  });
}
