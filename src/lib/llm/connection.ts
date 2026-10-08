import { requestLlm } from "./http";
import type { ResolvedLlmConfig } from "./types";

export async function testLlmConnection(config: ResolvedLlmConfig): Promise<{ message: string }> {
  if (config.mode === "demo") return { message: "The deterministic demo evaluator is ready. No LLM connection is needed." };
  const headers: Record<string, string> = config.protocol === "anthropic"
    ? { "x-api-key": config.apiKey ?? "", "anthropic-version": "2023-06-01" }
    : config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {};
  const payload = await requestLlm(config, config.protocol === "ollama" ? "api/tags" : "models", undefined, headers);
  const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const items = config.protocol === "ollama" ? record.models : record.data;
  if (!Array.isArray(items)) throw new Error("The provider did not return a supported model list.");
  const modelNames = items.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const model = item as Record<string, unknown>;
    const name = config.protocol === "ollama" ? model.name : model.id;
    return typeof name === "string" ? [name] : [];
  });
  const listed = modelNames.includes(config.model) || (config.protocol === "ollama" && modelNames.includes(`${config.model}:latest`));
  return { message: listed
    ? "Connected. Your selected model is listed by the server. No CV or job data was sent."
    : "Connected, but your selected model was not listed. Check its exact model name and access before evaluating. No CV or job data was sent." };
}
