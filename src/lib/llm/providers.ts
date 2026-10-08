import { requestLlm } from "./http";
import type { ResolvedLlmConfig } from "./types";

export interface StructuredLlmRequest {
  instructions: string;
  input: string;
  schema: Record<string, unknown>;
}

export class LlmProviderResponseError extends Error {
  constructor() {
    super("The selected LLM returned an unusable response.");
    this.name = "LlmProviderResponseError";
  }
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseJsonOutput(value: unknown): unknown {
  if (typeof value !== "string" || !value.trim()) throw new LlmProviderResponseError();
  // Some compatible APIs surround their otherwise valid JSON with a code fence.
  const fenced = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/i.exec(value);
  try {
    return JSON.parse(fenced ? fenced[1] : value);
  } catch {
    throw new LlmProviderResponseError();
  }
}

function bearerHeaders(config: ResolvedLlmConfig): Record<string, string> {
  return config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {};
}

/** Provider transport only. Domain validation and evidence checks stay in evaluation.ts. */
export async function requestStructuredLlmOutput(
  config: ResolvedLlmConfig,
  request: StructuredLlmRequest,
): Promise<unknown> {
  if (config.mode === "demo" || config.protocol === "openai-responses") {
    throw new LlmProviderResponseError();
  }

  if (config.protocol === "anthropic") {
    const response = object(await requestLlm(config, "/messages", {
      model: config.model,
      max_tokens: 8192,
      system: request.instructions,
      messages: [{ role: "user", content: request.input }],
      tools: [{
        name: "job_cv_evaluation",
        description: "Return the completed job and CV fit evaluation using the supplied evidence.",
        input_schema: request.schema,
      }],
      tool_choice: { type: "tool", name: "job_cv_evaluation", disable_parallel_tool_use: true },
    }, {
      ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
      "anthropic-version": "2023-06-01",
    }));
    const blocks = response?.content;
    if (!Array.isArray(blocks) || response?.stop_reason === "max_tokens") {
      throw new LlmProviderResponseError();
    }
    const matching = blocks.map(object).filter(block =>
      block?.type === "tool_use" && block.name === "job_cv_evaluation",
    );
    if (matching.length !== 1 || !object(matching[0]?.input)) {
      throw new LlmProviderResponseError();
    }
    return matching[0]!.input;
  }

  if (config.protocol === "ollama") {
    const response = object(await requestLlm(config, "/api/chat", {
      model: config.model,
      stream: false,
      messages: [
        { role: "system", content: request.instructions },
        { role: "user", content: request.input },
      ],
      format: request.schema,
    }, bearerHeaders(config)));
    if (response?.done === false || response?.done_reason === "length") {
      throw new LlmProviderResponseError();
    }
    return parseJsonOutput(object(response?.message)?.content);
  }

  // Compatible endpoints vary in support for response_format. A single request
  // carries the same schema in its system message, then domain validation below
  // rejects malformed or out-of-schema output without a second paid request.
  const response = object(await requestLlm(config, "/chat/completions", {
    model: config.model,
    stream: false,
    messages: [
      {
        role: "system",
        content: `${request.instructions}\n\nReturn only a JSON object matching this schema:\n${JSON.stringify(request.schema)}`,
      },
      { role: "user", content: request.input },
    ],
  }, bearerHeaders(config)));
  const choices = response?.choices;
  const choice = Array.isArray(choices) ? object(choices[0]) : null;
  if (!choice || choice.finish_reason === "length" || choice.finish_reason === "content_filter") {
    throw new LlmProviderResponseError();
  }
  const message = object(choice.message);
  if (message?.refusal) throw new LlmProviderResponseError();
  return parseJsonOutput(message?.content);
}
