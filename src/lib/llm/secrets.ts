import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { DataRepository } from "../data/repository";
import type { LlmSettings } from "./types";

export class LlmSettingsConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmSettingsConfigurationError";
  }
}

function decodeEncryptionKey(value: string): Buffer {
  const decoded = Buffer.from(value, "base64");
  if (decoded.length !== 32 || decoded.toString("base64") !== value) {
    throw new LlmSettingsConfigurationError(
      "LLM_SETTINGS_ENCRYPTION_KEY must contain a 32-byte base64 encryption key.",
    );
  }
  return decoded;
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

const localKeyInitialization = new Map<string, Promise<Buffer>>();

async function readOrCreateLocalKey(secretPath: string): Promise<Buffer> {
  try {
    return decodeEncryptionKey((await readFile(secretPath, "utf8")).trim());
  } catch (error) {
    if (!isNodeError(error, "ENOENT")) throw error;
  }
  await mkdir(path.dirname(secretPath), { recursive: true, mode: 0o700 });
  const generated = randomBytes(32).toString("base64");
  try {
    await writeFile(secretPath, generated + "\n", { encoding: "utf8", mode: 0o600, flag: "wx" });
    return decodeEncryptionKey(generated);
  } catch (error) {
    if (!isNodeError(error, "EEXIST")) throw error;
    return decodeEncryptionKey((await readFile(secretPath, "utf8")).trim());
  }
}

async function encryptionKey(repository: DataRepository): Promise<Buffer> {
  const configuredKey = process.env.LLM_SETTINGS_ENCRYPTION_KEY?.trim();
  if (configuredKey) return decodeEncryptionKey(configuredKey);

  // The private local secret follows the selected data store, including isolated
  // demo/browser-test stores. Hosted accounts always require an environment key.
  if (
    process.env.NODE_ENV === "production" || repository.mode !== "local" ||
    !("filePath" in repository) || typeof repository.filePath !== "string"
  ) {
    throw new LlmSettingsConfigurationError(
      "Configure LLM_SETTINGS_ENCRYPTION_KEY on the server before saving API keys.",
    );
  }
  const secretPath = repository.filePath + ".llm-settings.key";
  let initialization = localKeyInitialization.get(secretPath);
  if (!initialization) {
    initialization = readOrCreateLocalKey(secretPath);
    localKeyInitialization.set(secretPath, initialization);
    void initialization.finally(() => localKeyInitialization.delete(secretPath)).catch(() => undefined);
  }
  return initialization;
}

type CredentialBinding = Pick<LlmSettings, "mode" | "protocol" | "baseUrl">;

function ownerContext(repository: DataRepository, binding: CredentialBinding): Buffer {
  return Buffer.from(JSON.stringify({
    purpose: "greencv:llm-settings:v1", userId: repository.userId,
    mode: binding.mode, protocol: binding.protocol, baseUrl: binding.baseUrl,
  }), "utf8");
}

export async function encryptLlmApiKey(
  repository: DataRepository,
  apiKey: string,
  binding: CredentialBinding,
): Promise<string> {
  const key = await encryptionKey(repository);
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(ownerContext(repository, binding));
  const encrypted = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  return ["v1", nonce.toString("base64"), cipher.getAuthTag().toString("base64"),
    encrypted.toString("base64")].join(":");
}

export async function decryptLlmApiKey(
  repository: DataRepository,
  encrypted: string,
  binding: CredentialBinding,
): Promise<string> {
  const key = await encryptionKey(repository);
  try {
    const parts = encrypted.split(":");
    if (parts.length !== 4 || parts[0] !== "v1") throw new Error("Invalid ciphertext.");
    const nonce = Buffer.from(parts[1], "base64");
    const tag = Buffer.from(parts[2], "base64");
    const content = Buffer.from(parts[3], "base64");
    if (nonce.length !== 12 || tag.length !== 16 || content.length === 0 || content.length > 4096) {
      throw new Error("Invalid ciphertext.");
    }
    const cipher = createDecipheriv("aes-256-gcm", key, nonce);
    cipher.setAAD(ownerContext(repository, binding));
    cipher.setAuthTag(tag);
    return Buffer.concat([cipher.update(content), cipher.final()]).toString("utf8");
  } catch {
    throw new LlmSettingsConfigurationError(
      "The saved API key cannot be decrypted. Restore the server encryption key or replace the saved API key.",
    );
  }
}
