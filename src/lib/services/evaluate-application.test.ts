import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DataRepository } from "@/lib/data/repository";
import type { ApplicationRecord, Evaluation, EvaluationCreateInput } from "@/lib/data/types";
import type { ResolvedLlmConfig } from "@/lib/llm/types";
import { LlmHttpError } from "@/lib/llm/http";
import { LlmSettingsValidationError } from "@/lib/llm/settings";
import { EvaluationQuotaError } from "@/lib/evaluation-quota";
import { EVALUATION_PROMPT_VERSION, evaluateApplication, EvaluationExecutionError } from "./evaluate-application";

const { evaluateRole, resolveLlmConfig } = vi.hoisted(() => ({
  evaluateRole: vi.fn(), resolveLlmConfig: vi.fn(),
}));
vi.mock("@/lib/evaluation", () => ({ evaluateRole }));
vi.mock("@/lib/llm/settings", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/llm/settings")>(), resolveLlmConfig,
}));

const application = {
  id: "application", jobId: "job", cvVersionId: "cv",
  job: { title: "Engineer", company: "Example", description: "Build Python production services." },
  cvVersion: { id: "cv", name: "Private CV", content: "Built Python production services." },
} as ApplicationRecord;
const result = {
  recommendation: "apply", overallScore: 80, summary: "Evidence found.",
  strongMatches: [{ requirement: "Python", evidence: "Built Python production services.", confidence: "strong" }],
  partialMatches: [], gaps: [], suggestedEdits: [], keywords: [],
};
function config(mode: ResolvedLlmConfig["mode"] = "api", fingerprint = "current-provider"): ResolvedLlmConfig {
  return { mode, protocol: mode === "local" ? "ollama" : "openai", baseUrl: "https://example.invalid/v1", model: "selected-model", apiKey: mode === "api" ? "private-key" : null, fingerprint };
}
function stored(overrides: Partial<Evaluation> = {}): Evaluation {
  return {
    id: "existing", applicationId: application.id, jobId: application.jobId,
    cvVersionId: "cv", status: "completed", promptVersion: EVALUATION_PROMPT_VERSION,
    model: "selected-model", providerMode: "api", providerFingerprint: "current-provider",
    createdAt: new Date().toISOString(),
    ...overrides,
  } as Evaluation;
}
function repository(initial: Evaluation[] = []) {
  const records = [...initial];
  const methods = {
    getApplication: vi.fn().mockResolvedValue(application),
    listEvaluations: vi.fn().mockImplementation(async () => [...records]),
    createEvaluation: vi.fn().mockImplementation(async (input: EvaluationCreateInput) => {
      const record = stored({ ...input, id: "new-evaluation", createdAt: new Date().toISOString() });
      records.push(record);
      return record;
    }),
    updateEvaluation: vi.fn().mockImplementation(async (id: string, input: Partial<Evaluation>) => {
      const record = records.find(item => item.id === id)!;
      Object.assign(record, input);
      return record;
    }),
    createApplicationEvent: vi.fn().mockResolvedValue({ id: "event" }),
  };
  return { value: methods as unknown as DataRepository, methods, records };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("MAX_EVALUATIONS_PER_DAY", "20");
  resolveLlmConfig.mockResolvedValue(config());
  evaluateRole.mockResolvedValue({ result, model: "selected-model", isDemo: false });
});
afterEach(() => vi.unstubAllEnvs());

describe("evaluation with owner provider settings", () => {
  it("reuses completed evidence only for the same provider configuration", async () => {
    const existing = stored();
    const repo = repository([existing]);
    expect(await evaluateApplication(repo.value, application.id)).toEqual({ evaluation: existing, isDemo: false, reused: true });
    expect(resolveLlmConfig).toHaveBeenCalledWith(repo.value);
    expect(evaluateRole).not.toHaveBeenCalled();
    expect(repo.methods.createEvaluation).not.toHaveBeenCalled();
  });

  it("creates a new history entry when provider settings change", async () => {
    const existing = stored({ providerMode: "local", providerFingerprint: "previous-local", model: "previous-model" });
    const repo = repository([existing]);
    const output = await evaluateApplication(repo.value, application.id);
    expect(output.reused).toBe(false);
    expect(repo.records[0]).toEqual(existing);
    expect(repo.methods.createEvaluation).toHaveBeenCalledWith(expect.objectContaining({
      providerMode: "api", providerFingerprint: "current-provider", model: "selected-model",
    }));
    expect(evaluateRole).toHaveBeenCalledWith(expect.objectContaining({ cvContent: application.cvVersion!.content }), config());
    expect(output.evaluation.providerFingerprint).toBe("current-provider");
  });

  it("does not reuse an older unlabelled result for an explicitly selected provider", async () => {
    const repo = repository([stored({ providerMode: null, providerFingerprint: null })]);
    expect((await evaluateApplication(repo.value, application.id)).reused).toBe(false);
    expect(evaluateRole).toHaveBeenCalledOnce();
  });

  it("preserves reuse of the original default Responses evaluator's historical results", async () => {
    resolveLlmConfig.mockResolvedValue({ ...config(), protocol: "openai-responses" });
    const repo = repository([stored({ providerMode: null, providerFingerprint: null })]);
    expect((await evaluateApplication(repo.value, application.id)).reused).toBe(true);
    expect(evaluateRole).not.toHaveBeenCalled();
  });

  it("honors force even when configuration matches", async () => {
    const repo = repository([stored()]);
    expect((await evaluateApplication(repo.value, application.id, { force: true })).reused).toBe(false);
    expect(evaluateRole).toHaveBeenCalledOnce();
  });

  it("enforces the paid guardrail for individually configured APIs without a global key", async () => {
    vi.stubEnv("MAX_EVALUATIONS_PER_DAY", "0");
    const repo = repository();
    await expect(evaluateApplication(repo.value, application.id)).rejects.toBeInstanceOf(EvaluationQuotaError);
    expect(evaluateRole).not.toHaveBeenCalled();
    expect(repo.records[0].providerMode).toBe("api");
    expect(repo.records[0].status).toBe("failed");
    expect(repo.methods.listEvaluations).toHaveBeenCalledTimes(2);
  });

  it("allows local evaluation at a zero paid limit even if a global paid key exists", async () => {
    vi.stubEnv("OPENAI_API_KEY", "global-paid-key");
    vi.stubEnv("MAX_EVALUATIONS_PER_DAY", "0");
    resolveLlmConfig.mockResolvedValue(config("local"));
    const repo = repository();
    const output = await evaluateApplication(repo.value, application.id);
    expect(output.evaluation.providerMode).toBe("local");
    expect(evaluateRole).toHaveBeenCalledOnce();
  });

  it("excludes today's local and demo attempts from the API allowance", async () => {
    vi.stubEnv("MAX_EVALUATIONS_PER_DAY", "1");
    const repo = repository([
      stored({ id: "local", providerMode: "local", providerFingerprint: "local", cvVersionId: "other-cv" }),
      stored({ id: "demo", providerMode: "demo", providerFingerprint: "demo", cvVersionId: "other-cv" }),
    ]);
    await expect(evaluateApplication(repo.value, application.id)).resolves.toMatchObject({ reused: false });
    expect(evaluateRole).toHaveBeenCalledOnce();
  });

  it("stores a safe failure without leaking a provider's key or response content", async () => {
    evaluateRole.mockRejectedValue(new Error("private-key private CV provider response"));
    const repo = repository();
    await expect(evaluateApplication(repo.value, application.id)).rejects.toThrow("Evaluation could not be completed. Try again later.");
    expect(repo.records[0].errorMessage).toBe("Evaluation could not be completed. Try again later.");
    expect(repo.records[0].status).toBe("failed");
    expect(repo.methods.createApplicationEvent).not.toHaveBeenCalled();
    expect(evaluateRole).toHaveBeenCalledTimes(1);
  });

  it("turns configuration resolution errors into a safe execution failure", async () => {
    resolveLlmConfig.mockRejectedValue(new Error("private encryption configuration"));
    const repo = repository();
    await expect(evaluateApplication(repo.value, application.id)).rejects.toBeInstanceOf(EvaluationExecutionError);
    expect(repo.methods.createEvaluation).not.toHaveBeenCalled();
    expect(evaluateRole).not.toHaveBeenCalled();
  });

  it("checks application ownership and CV attachment before resolving provider settings", async () => {
    const repo = repository();
    repo.methods.getApplication.mockResolvedValue(null);
    await expect(evaluateApplication(repo.value, "foreign")).rejects.toThrow("Application not found.");
    repo.methods.getApplication.mockResolvedValue({ ...application, cvVersionId: null, cvVersion: null });
    await expect(evaluateApplication(repo.value, application.id)).rejects.toThrow("Attach a CV version before evaluation.");
    expect(resolveLlmConfig).not.toHaveBeenCalled();
  });
});

describe("safe provider failures", () => {
  it("preserves actionable transport messages for an explicitly selected provider", async () => {
    const error = new LlmHttpError("transport_error", "Could not connect to the LLM endpoint.");
    evaluateRole.mockRejectedValue(error);
    resolveLlmConfig.mockResolvedValue(config("local"));
    const repo = repository();
    await expect(evaluateApplication(repo.value, application.id)).rejects.toThrow(error.message);
    expect(repo.records[0].errorMessage).toBe(error.message);
  });

  it("keeps the original default evaluator's generic public failure", async () => {
    evaluateRole.mockRejectedValue(new LlmHttpError("http_error", "The LLM endpoint rejected the credentials.", 401));
    resolveLlmConfig.mockResolvedValue({ ...config(), protocol: "openai-responses" });
    const repo = repository();
    await expect(evaluateApplication(repo.value, application.id)).rejects.toThrow("Evaluation could not be completed. Try again later.");
  });

  it("explains a selected provider's missing key without exposing the saved configuration", async () => {
    resolveLlmConfig.mockRejectedValue(new LlmSettingsValidationError("The selected API provider needs an API key."));
    const repo = repository();
    await expect(evaluateApplication(repo.value, application.id)).rejects.toThrow("The selected API provider needs an API key.");
    expect(repo.methods.createEvaluation).not.toHaveBeenCalled();
  });
});
