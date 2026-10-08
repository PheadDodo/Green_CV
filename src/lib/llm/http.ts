import { lookup } from "node:dns/promises";
import { request as httpRequest, type RequestOptions } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

import { isPublicNetworkAddress } from "../import/url";
import type { ResolvedLlmConfig } from "./types";

export type LlmHttpErrorCode =
  | "invalid_url"
  | "blocked_address"
  | "dns_failed"
  | "local_unavailable"
  | "invalid_request"
  | "redirect"
  | "http_error"
  | "timeout"
  | "response_too_large"
  | "invalid_response"
  | "transport_error";

/** Safe to return to a client: never includes credentials, URLs, upstream bodies, or causes. */
export class LlmHttpError extends Error {
  readonly code: LlmHttpErrorCode;
  readonly status?: number;

  constructor(code: LlmHttpErrorCode, message: string, status?: number) {
    super(message);
    this.name = "LlmHttpError";
    this.code = code;
    this.status = status;
  }
}

export interface LlmHttpResponse {
  status: number;
  headers: Readonly<Record<string, string | readonly string[] | undefined>>;
  body: AsyncIterable<Uint8Array>;
  dispose?: () => void;
}

export interface LlmHttpRequest {
  url: URL;
  /** The transport must connect only to these already validated addresses. */
  approvedAddresses: readonly string[];
  method: "GET" | "POST";
  body?: string;
  headers: Readonly<Record<string, string>>;
  signal: AbortSignal;
}

export interface LlmHttpRuntime {
  resolveHostname(hostname: string): Promise<readonly string[]>;
  request(input: LlmHttpRequest): Promise<LlmHttpResponse>;
}

export type LlmRequester = (
  config: ResolvedLlmConfig,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
) => Promise<unknown>;

const MAX_RESPONSE_BYTES = 1024 * 1024;
const API_TIMEOUT_MS = 60_000;
const LOCAL_TIMEOUT_MS = 90_000;

function canonicalHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
}

function isLoopbackAddress(address: string): boolean {
  return (isIP(address) === 4 && address.startsWith("127.")) || address === "::1";
}

/** Static validation is also used before persisting settings; DNS is checked again for each request. */
export function validateLlmBaseUrl(mode: "api" | "local", baseUrl: string): string {
  if (typeof baseUrl !== "string" || baseUrl.length > 2048 || /[\u0000-\u001f\u007f?#]/.test(baseUrl)) {
    throw new LlmHttpError("invalid_url", "Use a base URL without credentials, query parameters, or fragments.");
  }
  let url: URL;
  try {
    url = new URL(baseUrl.trim());
  } catch {
    throw new LlmHttpError("invalid_url", "Enter a valid absolute LLM base URL.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new LlmHttpError("invalid_url", "Use a base URL without credentials, query parameters, or fragments.");
  }
  const hostname = canonicalHostname(url.hostname);
  if (mode === "local") {
    if (process.env.NODE_ENV === "production") {
      throw new LlmHttpError("local_unavailable", "Local LLM connections are available only during local development.");
    }
    if ((url.protocol !== "http:" && url.protocol !== "https:") || (hostname !== "localhost" && !isLoopbackAddress(hostname))) {
      throw new LlmHttpError("invalid_url", "Local LLM URLs must use HTTP or HTTPS on localhost or a loopback address.");
    }
  } else {
    if (url.protocol !== "https:") {
      throw new LlmHttpError("invalid_url", "API LLM URLs must use HTTPS.");
    }
    if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
      throw new LlmHttpError("blocked_address", "API LLM endpoints must use a public network address.");
    }
    if (isIP(hostname) && !isPublicNetworkAddress(hostname)) {
      throw new LlmHttpError("blocked_address", "API LLM endpoints must use a public network address.");
    }
  }
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.toString().replace(/\/$/, "");
}

function requestUrl(config: ResolvedLlmConfig, path: string): URL {
  if (config.mode !== "api" && config.mode !== "local") {
    throw new LlmHttpError("invalid_request", "Choose an API or local LLM before connecting.");
  }
  const base = new URL(validateLlmBaseUrl(config.mode, config.baseUrl));
  // Paths are appended to the configured prefix, including /v1, rather than replacing it.
  if (typeof path !== "string" || !/^\/?[a-zA-Z0-9._~-]+(?:\/[a-zA-Z0-9._~-]+)*$/.test(path) || path.split("/").some((part) => part === "." || part === "..")) {
    throw new LlmHttpError("invalid_request", "The LLM request path is invalid.");
  }
  base.pathname = base.pathname.replace(/\/+$/, "") + "/" + path.replace(/^\//, "");
  return base;
}

function requestHeaders(headers: Record<string, string>, body?: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    const normalized = name.toLowerCase();
    if (!/^[!#$%&'*+.^_\x60|~0-9a-z-]+$/.test(normalized) || typeof value !== "string" || /[\r\n\u0000]/.test(value) || ["host", "content-length", "transfer-encoding", "connection", "accept-encoding"].includes(normalized)) {
      throw new LlmHttpError("invalid_request", "The LLM request headers are invalid.");
    }
    result[normalized] = value;
  }
  result.accept = "application/json";
  result["accept-encoding"] = "identity";
  if (body !== undefined) {
    result["content-type"] = "application/json";
    result["content-length"] = String(Buffer.byteLength(body));
  }
  return result;
}

function withDeadline<T>(operation: Promise<T>, signal: AbortSignal, disposeLateResult?: (result: T) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const onAbort = () => {
      if (settled) return;
      settled = true;
      reject(new LlmHttpError("timeout", "The LLM connection timed out."));
    };
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
    operation.then((result) => {
      signal.removeEventListener("abort", onAbort);
      if (settled) {
        disposeLateResult?.(result);
        return;
      }
      settled = true;
      resolve(result);
    }, (error: unknown) => {
      signal.removeEventListener("abort", onAbort);
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
}

async function approveAddresses(url: URL, mode: "api" | "local", runtime: LlmHttpRuntime, signal: AbortSignal): Promise<readonly string[]> {
  const hostname = canonicalHostname(url.hostname);
  let addresses: readonly string[];
  try {
    addresses = isIP(hostname) ? [hostname] : await withDeadline(runtime.resolveHostname(hostname), signal);
  } catch (error) {
    if (error instanceof LlmHttpError) throw error;
    throw new LlmHttpError("dns_failed", "Could not resolve the LLM endpoint.");
  }
  const approved = [...new Set(addresses.map(canonicalHostname))];
  if (approved.length === 0) throw new LlmHttpError("dns_failed", "Could not resolve the LLM endpoint.");
  if (approved.some((address) => mode === "local" ? !isLoopbackAddress(address) : !isPublicNetworkAddress(address))) {
    throw new LlmHttpError("blocked_address", mode === "local" ? "The local LLM endpoint must resolve only to loopback addresses." : "The API LLM endpoint must resolve only to public network addresses.");
  }
  return approved;
}

function headerValue(response: LlmHttpResponse, name: string): string | undefined {
  const value = Object.entries(response.headers).find(([key]) => key.toLowerCase() === name)?.[1];
  return typeof value === "string" ? value : value?.[0];
}

async function readJson(response: LlmHttpResponse, signal: AbortSignal): Promise<unknown> {
  const length = headerValue(response, "content-length");
  if (length && /^\d+$/.test(length) && Number(length) > MAX_RESPONSE_BYTES) {
    throw new LlmHttpError("response_too_large", "The LLM response exceeded the size limit.");
  }
  const encoding = headerValue(response, "content-encoding")?.trim().toLowerCase();
  if (encoding && encoding !== "identity") {
    throw new LlmHttpError("invalid_response", "The LLM endpoint returned an unsupported response format.");
  }
  const contentType = headerValue(response, "content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType && contentType !== "application/json" && !/^application\/[a-z0-9!#$&^_.+-]+\+json$/.test(contentType)) {
    throw new LlmHttpError("invalid_response", "The LLM endpoint must return JSON.");
  }
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  const iterator = response.body[Symbol.asyncIterator]();
  try {
    for (;;) {
      const next = await withDeadline(iterator.next(), signal);
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        throw new LlmHttpError("response_too_large", "The LLM response exceeded the size limit.");
      }
      chunks.push(next.value);
    }
  } finally {
    if (iterator.return) void iterator.return().catch(() => undefined);
  }
  try {
    return JSON.parse(Buffer.concat(chunks, bytes).toString("utf8")) as unknown;
  } catch {
    throw new LlmHttpError("invalid_response", "The LLM endpoint returned invalid JSON.");
  }
}

/** Injecting the network boundary permits security tests without contacting an LLM. */
export function createLlmRequester(runtime: LlmHttpRuntime): LlmRequester {
  return async (config, path, body, headers = {}) => {
    const url = requestUrl(config, path);
    let serialized: string | undefined;
    try {
      serialized = body === undefined ? undefined : JSON.stringify(body);
      if (body !== undefined && serialized === undefined) throw new Error();
    } catch {
      throw new LlmHttpError("invalid_request", "The LLM request body must be valid JSON.");
    }
    const safeHeaders = requestHeaders(headers, serialized);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.mode === "local" ? LOCAL_TIMEOUT_MS : API_TIMEOUT_MS);
    let response: LlmHttpResponse | undefined;
    try {
      const approvedAddresses = await approveAddresses(url, config.mode as "api" | "local", runtime, controller.signal);
      response = await withDeadline(runtime.request({ url, approvedAddresses, signal: controller.signal, method: serialized === undefined ? "GET" : "POST", body: serialized, headers: safeHeaders }), controller.signal, (late) => late.dispose?.());
      if (response.status >= 300 && response.status < 400) {
        throw new LlmHttpError("redirect", "LLM endpoint redirects are not allowed. Configure its final base URL.");
      }
      if (response.status < 200 || response.status >= 300) {
        const message = response.status === 401 || response.status === 403
          ? "The LLM endpoint rejected the credentials."
          : response.status === 429 ? "The LLM endpoint rate limit was reached." : "The LLM endpoint returned an unsuccessful response.";
        throw new LlmHttpError("http_error", message, response.status);
      }
      return await readJson(response, controller.signal);
    } catch (error) {
      if (error instanceof LlmHttpError) throw error;
      throw new LlmHttpError("transport_error", "Could not connect to the LLM endpoint.");
    } finally {
      clearTimeout(timer);
      response?.dispose?.();
    }
  };
}

const defaultRuntime: LlmHttpRuntime = {
  resolveHostname: async (hostname) => (await lookup(hostname, { all: true, verbatim: true })).map((record) => record.address),
  request: async ({ url, approvedAddresses, method, body, headers, signal }) => new Promise((resolve, reject) => {
    const address = approvedAddresses[0];
    const options: RequestOptions & { autoSelectFamily: false } = {
      method,
      headers,
      signal,
      // No reused socket or second DNS lookup may bypass the address approval.
      agent: false,
      family: isIP(address),
      autoSelectFamily: false,
      lookup: (_hostname, _options, callback) => callback(null, address, isIP(address)),
    };
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, options, (incoming) => resolve({
      status: incoming.statusCode ?? 0,
      headers: incoming.headers,
      body: (async function* () {
        for await (const chunk of incoming) {
          yield typeof chunk === "string" ? new TextEncoder().encode(chunk) : new Uint8Array(chunk);
        }
      })(),
      dispose: () => incoming.destroy(),
    }));
    request.once("error", reject);
    request.end(body);
  }),
};

export const requestLlm: LlmRequester = createLlmRequester(defaultRuntime);
