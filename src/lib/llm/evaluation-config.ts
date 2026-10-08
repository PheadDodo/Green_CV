import type { Evaluation } from "../data/types";
import type { ResolvedLlmConfig } from "./types";

/** Retained results belong to the provider/model configuration that produced them. */
export function usesLlmConfiguration(evaluation: Evaluation, config: ResolvedLlmConfig): boolean {
  if (evaluation.providerFingerprint) {
    return evaluation.providerFingerprint === config.fingerprint;
  }
  // Records created before provider settings existed can be reused only by the
  // original default evaluator, never by an explicitly selected new provider.
  if (config.mode === "demo") return evaluation.model === "deterministic-demo-evaluator";
  return config.protocol === "openai-responses" && evaluation.model === config.model;
}
