import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedLlmConfig } from "./types";
vi.mock("./http", () => ({ requestLlm: vi.fn() }));
import { requestLlm } from "./http";
import { testLlmConnection } from "./connection";
const config: ResolvedLlmConfig = { mode: "api", protocol: "anthropic", baseUrl: "https://api.anthropic.com/v1", model: "selected-model", apiKey: "private-key", fingerprint: "test" };
beforeEach(() => vi.clearAllMocks());
describe("LLM connection test", () => {
  it("checks model availability without generating text or submitting CV data", async () => {
    vi.mocked(requestLlm).mockResolvedValue({ data: [{ id: config.model }] });
    expect((await testLlmConnection(config)).message).toContain("Your selected model is listed");
    expect(requestLlm).toHaveBeenCalledWith(config, "models", undefined, { "x-api-key": "private-key", "anthropic-version": "2023-06-01" });
  });
  it("checks native Ollama model names and reports missing models honestly", async () => {
    vi.mocked(requestLlm).mockResolvedValueOnce({ models: [{ name: "local-model:latest" }] });
    expect((await testLlmConnection({ ...config, mode: "local", protocol: "ollama", model: "local-model", apiKey: null })).message).toContain("Your selected model is listed");
    vi.mocked(requestLlm).mockResolvedValueOnce({ models: [] });
    expect((await testLlmConnection({ ...config, mode: "local", protocol: "ollama" })).message).toContain("was not listed");
  });
  it("does not claim success for an unrelated JSON response", async () => {
    vi.mocked(requestLlm).mockResolvedValue({ success: true });
    await expect(testLlmConnection(config)).rejects.toThrow("supported model list");
  });
  it("keeps deterministic evaluation offline", async () => {
    expect((await testLlmConnection({ ...config, mode: "demo" })).message).toContain("No LLM connection");
    expect(requestLlm).not.toHaveBeenCalled();
  });
});
