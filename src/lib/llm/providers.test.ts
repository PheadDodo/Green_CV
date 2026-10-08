import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestStructuredLlmOutput } from "./providers";
import type { ResolvedLlmConfig } from "./types";

const { requestLlm } = vi.hoisted(() => ({ requestLlm: vi.fn() }));
vi.mock("./http", () => ({ requestLlm }));

const request = {
  instructions: "Use only supplied CV evidence.",
  input: "JOB DATA\nCV DATA",
  schema: { type: "object", properties: { summary: { type: "string" } }, required: ["summary"] },
};
const result = { summary: "Evidence found." };
function config(protocol: ResolvedLlmConfig["protocol"], mode: "api" | "local" = "api"): ResolvedLlmConfig {
  return { mode, protocol, baseUrl: "https://provider.example/v1", model: "chosen-model", apiKey: mode === "api" ? "private-key" : null, fingerprint: "configured-provider" };
}

beforeEach(() => vi.clearAllMocks());

describe("structured LLM provider transports", () => {
  it("uses a single generic compatible request with schema instructions and server-only credentials", async () => {
    requestLlm.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(result) }, finish_reason: "stop" }] });
    expect(await requestStructuredLlmOutput(config("openai"), request)).toEqual(result);
    expect(requestLlm).toHaveBeenCalledExactlyOnceWith(config("openai"), "/chat/completions", {
      model: "chosen-model", stream: false,
      messages: [
        { role: "system", content: `${request.instructions}\n\nReturn only a JSON object matching this schema:\n${JSON.stringify(request.schema)}` },
        { role: "user", content: request.input },
      ],
    }, { Authorization: "Bearer private-key" });
    expect(JSON.stringify(requestLlm.mock.calls[0][2])).not.toContain("private-key");
  });

  it("supports compatible local servers without an API key", async () => {
    requestLlm.mockResolvedValue({ choices: [{ message: { content: "\`\`\`json\n{\"summary\":\"Evidence found.\"}\n\`\`\`" } }] });
    expect(await requestStructuredLlmOutput(config("openai", "local"), request)).toEqual(result);
    expect(requestLlm.mock.calls[0][3]).toEqual({});
  });

  it("extracts only the forced native Anthropic tool's input", async () => {
    requestLlm.mockResolvedValue({ content: [{ type: "text", text: "Context" }, { type: "tool_use", name: "job_cv_evaluation", input: result }], stop_reason: "tool_use" });
    expect(await requestStructuredLlmOutput(config("anthropic"), request)).toEqual(result);
    expect(requestLlm).toHaveBeenCalledWith(config("anthropic"), "/messages", expect.objectContaining({
      system: request.instructions,
      tools: [expect.objectContaining({ name: "job_cv_evaluation", input_schema: request.schema })],
      tool_choice: { type: "tool", name: "job_cv_evaluation", disable_parallel_tool_use: true },
    }), { "x-api-key": "private-key", "anthropic-version": "2023-06-01" });
  });

  it("sends native Ollama schema output requests without streaming", async () => {
    requestLlm.mockResolvedValue({ message: { content: JSON.stringify(result) }, done: true, done_reason: "stop" });
    expect(await requestStructuredLlmOutput(config("ollama", "local"), request)).toEqual(result);
    expect(requestLlm).toHaveBeenCalledExactlyOnceWith(config("ollama", "local"), "/api/chat", {
      model: "chosen-model", stream: false,
      messages: [{ role: "system", content: request.instructions }, { role: "user", content: request.input }],
      format: request.schema,
    }, {});
  });

  it.each([
    ["openai", { choices: [{ message: { content: "private-key malformed JSON" } }] }],
    ["openai", { choices: [{ message: { content: JSON.stringify(result) }, finish_reason: "length" }] }],
    ["openai", { choices: [{ message: { refusal: "private refusal", content: JSON.stringify(result) } }] }],
    ["anthropic", { content: [{ type: "tool_use", name: "unrelated_tool", input: result }] }],
    ["anthropic", { content: [{ type: "tool_use", name: "job_cv_evaluation", input: result }], stop_reason: "max_tokens" }],
    ["ollama", { message: { content: JSON.stringify(result) }, done: false }],
  ] as const)("rejects unusable %s responses without exposing provider content", async (protocol, response) => {
    requestLlm.mockResolvedValue(response);
    await expect(requestStructuredLlmOutput(config(protocol), request)).rejects.toThrow("The selected LLM returned an unusable response.");
    expect(requestLlm).toHaveBeenCalledTimes(1);
  });

  it("never retries or falls back to another provider after a transport failure", async () => {
    const error = new Error("Selected LLM connection failed.");
    requestLlm.mockRejectedValue(error);
    await expect(requestStructuredLlmOutput(config("ollama", "local"), request)).rejects.toBe(error);
    expect(requestLlm).toHaveBeenCalledTimes(1);
  });
});
