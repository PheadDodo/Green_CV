export type LlmMode = "default" | "api" | "local";
export type LlmProtocol = "openai" | "anthropic" | "ollama";

/** Server persistence only. Ciphertext must never be returned to the browser. */
export interface LlmSettings {
  mode: LlmMode;
  protocol: LlmProtocol;
  baseUrl: string;
  model: string;
  apiKeyEncrypted: string | null;
  updatedAt: string | null;
}

export interface PublicLlmSettings {
  mode: LlmMode;
  protocol: LlmProtocol;
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  updatedAt: string | null;
}

export interface LlmSettingsInput {
  mode: LlmMode;
  protocol: LlmProtocol;
  baseUrl: string;
  model: string;
  /** Write-only. An empty value preserves a key for the same provider endpoint. */
  apiKey?: string;
  clearApiKey?: boolean;
}

/** Server-only configuration for provider adapters. Never serialize this object. */
export interface ResolvedLlmConfig {
  mode: "api" | "local" | "demo";
  protocol: LlmProtocol | "openai-responses";
  baseUrl: string;
  model: string;
  apiKey: string | null;
  fingerprint: string;
}
