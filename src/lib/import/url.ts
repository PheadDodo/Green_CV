import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { isIP } from "node:net";
import { request as httpsRequest } from "node:https";

export type JobUrlImportErrorCode =
  | "invalid_url"
  | "unsupported_protocol"
  | "blocked_hostname"
  | "blocked_port"
  | "blocked_address"
  | "dns_failed"
  | "redirect_limit"
  | "invalid_redirect"
  | "http_error"
  | "timeout"
  | "aborted"
  | "response_too_large"
  | "unsupported_content_type"
  | "unsupported_content_encoding"
  | "empty_content"
  | "transport_error";

export class JobUrlImportError extends Error {
  readonly code: JobUrlImportErrorCode;
  readonly url?: string;
  readonly status?: number;

  constructor(
    code: JobUrlImportErrorCode,
    message: string,
    details: { url?: string; status?: number; cause?: unknown } = {},
  ) {
    super(message, details.cause === undefined ? undefined : { cause: details.cause });
    this.name = "JobUrlImportError";
    this.code = code;
    this.url = details.url;
    this.status = details.status;
  }
}

export interface JobUrlHttpResponse {
  status: number;
  headers: Headers | Readonly<Record<string, string | readonly string[] | undefined>>;
  body: AsyncIterable<Uint8Array>;
  dispose?: () => void;
}

export interface JobUrlRequest {
  url: URL;
  /** Addresses approved immediately before connecting. The transport must pin to one of them. */
  approvedAddresses: readonly string[];
  signal: AbortSignal;
  headers: Readonly<Record<string, string>>;
}

export interface JobUrlFetchRuntime {
  resolveHostname(hostname: string): Promise<readonly string[]>;
  request(input: JobUrlRequest): Promise<JobUrlHttpResponse>;
}

export interface JobDescriptionFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  signal?: AbortSignal;
}

export interface ImportedJobDescription {
  sourceUrl: string;
  finalUrl: string;
  text: string;
  title: string | null;
  company: string | null;
  contentType: "html" | "text";
  bytes: number;
}

export type JobDescriptionFetcher = (
  url: string,
  options?: JobDescriptionFetchOptions,
) => Promise<ImportedJobDescription>;

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function canonicalHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
}

function parseIpv4(address: string): number | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map(Number);
  if (octets.some((part, index) => !Number.isInteger(part) || part < 0 || part > 255 || String(part) !== parts[index])) {
    return null;
  }
  return octets.reduce((result, octet) => result * 256 + octet, 0);
}

function ipv4InCidr(address: number, base: number, prefix: number): boolean {
  const divisor = 2 ** (32 - prefix);
  return Math.floor(address / divisor) === Math.floor(base / divisor);
}

function isPublicIpv4(address: string): boolean {
  const parsed = parseIpv4(address);
  if (parsed === null) return false;
  const blocked: Array<[string, number]> = [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.0.2.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["198.51.100.0", 24],
    ["203.0.113.0", 24],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
  ];
  return !blocked.some(([base, prefix]) => ipv4InCidr(parsed, parseIpv4(base)!, prefix));
}

function parseIpv6(address: string): number[] | null {
  let normalized = canonicalHostname(address);
  const zoneIndex = normalized.indexOf("%");
  if (zoneIndex !== -1) normalized = normalized.slice(0, zoneIndex);

  if (normalized.includes(".")) {
    const lastColon = normalized.lastIndexOf(":");
    const ipv4 = parseIpv4(normalized.slice(lastColon + 1));
    if (lastColon === -1 || ipv4 === null) return null;
    normalized = `${normalized.slice(0, lastColon)}:${(ipv4 >>> 16).toString(16)}:${(ipv4 & 0xffff).toString(16)}`;
  }

  const halves = normalized.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  if (halves.length === 1 && left.length !== 8) return null;
  const missing = 8 - left.length - right.length;
  if (missing < (halves.length === 2 ? 1 : 0)) return null;
  const groups = [...left, ...Array(missing).fill("0"), ...right];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/i.test(group))) return null;
  return groups.map((group) => Number.parseInt(group, 16));
}

function ipv6InCidr(address: readonly number[], base: readonly number[], prefix: number): boolean {
  const completeGroups = Math.floor(prefix / 16);
  for (let index = 0; index < completeGroups; index += 1) {
    if (address[index] !== base[index]) return false;
  }
  const remainingBits = prefix % 16;
  if (remainingBits === 0) return true;
  const mask = (0xffff << (16 - remainingBits)) & 0xffff;
  return (address[completeGroups] & mask) === (base[completeGroups] & mask);
}

function isPublicIpv6(address: string): boolean {
  const parsed = parseIpv6(address);
  if (parsed === null) return false;

  // IPv4-mapped IPv6 must be evaluated using the IPv4 policy.
  if (parsed.slice(0, 5).every((group) => group === 0) && parsed[5] === 0xffff) {
    const value = parsed[6] * 65_536 + parsed[7];
    const embedded = [24, 16, 8, 0].map((shift) => String((value >>> shift) & 255)).join(".");
    return isPublicIpv4(embedded);
  }

  const globalUnicastBase = [0x2000, 0, 0, 0, 0, 0, 0, 0];
  if (!ipv6InCidr(parsed, globalUnicastBase, 3)) return false;
  const documentationBase = [0x2001, 0x0db8, 0, 0, 0, 0, 0, 0];
  if (ipv6InCidr(parsed, documentationBase, 32)) return false;
  return true;
}

export function isPublicNetworkAddress(address: string): boolean {
  const version = isIP(canonicalHostname(address));
  if (version === 4) return isPublicIpv4(address);
  if (version === 6) return isPublicIpv6(address);
  return false;
}

function parseUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch (cause) {
    throw new JobUrlImportError("invalid_url", "Job URL must be an absolute URL", {
      url: input,
      cause,
    });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new JobUrlImportError("unsupported_protocol", "Only HTTP and HTTPS job URLs are allowed", {
      url: url.toString(),
    });
  }
  if (url.username || url.password) {
    throw new JobUrlImportError("blocked_hostname", "Credentials are not allowed in job URLs", {
      url: url.toString(),
    });
  }
  if (url.port) {
    throw new JobUrlImportError("blocked_port", "Job URLs may only use standard HTTP(S) ports", {
      url: url.toString(),
    });
  }
  const hostname = canonicalHostname(url.hostname);
  if (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new JobUrlImportError("blocked_hostname", "Local hostnames are not allowed", {
      url: url.toString(),
    });
  }
  return url;
}

async function approveUrl(
  url: URL,
  runtime: JobUrlFetchRuntime,
  signal: AbortSignal,
  createAbortError: () => JobUrlImportError,
): Promise<readonly string[]> {
  const hostname = canonicalHostname(url.hostname);
  const ipVersion = isIP(hostname);
  let addresses: readonly string[];
  if (ipVersion > 0) {
    addresses = [hostname];
  } else {
    try {
      addresses = await raceWithAbort(runtime.resolveHostname(hostname), signal, createAbortError);
    } catch (cause) {
      if (cause instanceof JobUrlImportError) throw cause;
      throw new JobUrlImportError("dns_failed", "Could not resolve the job URL hostname", {
        url: url.toString(),
        cause,
      });
    }
  }
  const unique = [...new Set(addresses.map(canonicalHostname))];
  if (unique.length === 0) {
    throw new JobUrlImportError("dns_failed", "Job URL hostname resolved to no addresses", {
      url: url.toString(),
    });
  }
  if (unique.some((address) => !isPublicNetworkAddress(address))) {
    throw new JobUrlImportError("blocked_address", "Job URL resolves to a non-public network", {
      url: url.toString(),
    });
  }
  return unique;
}

function headerValue(
  headers: JobUrlHttpResponse["headers"],
  name: string,
): string | undefined {
  if (headers instanceof Headers) return headers.get(name) ?? undefined;
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
  const value = entry?.[1];
  if (typeof value === "string") return value;
  return value?.[0];
}

function decodeHtmlEntities(value: string): string {
  const named: Readonly<Record<string, string>> = {
    amp: "&",
    apos: "'",
    gt: ">",
    hellip: "…",
    lt: "<",
    mdash: "—",
    ndash: "–",
    nbsp: " ",
    quot: '"',
  };
  return value.replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z][a-z0-9]+);/gi, (entity, token: string) => {
    if (!token.startsWith("#")) return named[token.toLowerCase()] ?? entity;
    const hexadecimal = token[1]?.toLowerCase() === "x";
    const number = Number.parseInt(token.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
    if (!Number.isFinite(number) || number <= 0 || number > 0x10ffff || (number >= 0xd800 && number <= 0xdfff)) {
      return "�";
    }
    return String.fromCodePoint(number);
  });
}

function normalizeReadableText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[\t \f\v]+/g, " ").trim())
    .filter((line, index, lines) => line !== "" || (index > 0 && lines[index - 1] !== ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function htmlFragmentToText(fragment: string): string {
  return normalizeReadableText(
    decodeHtmlEntities(
      fragment
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(
          /<(script|style|noscript|svg|template|head|nav|footer|form|iframe|object)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
          " ",
        )
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<li\b[^>]*>/gi, "• ")
        .replace(/<\/(?:address|article|aside|blockquote|div|dl|fieldset|figcaption|figure|footer|form|h[1-6]|header|li|main|nav|ol|p|pre|section|table|tr|ul)\s*>/gi, "\n")
        .replace(/<[^>]*>/g, " "),
    ),
  );
}

interface JobPostingMetadata {
  title: string | null;
  company: string | null;
  description: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasJobPostingType(value: unknown): boolean {
  return typeof value === "string"
    ? value.toLowerCase() === "jobposting"
    : Array.isArray(value) && value.some(hasJobPostingType);
}

function findJobPosting(value: unknown): Record<string, unknown> | null {
  const pending: unknown[] = [value];
  let inspected = 0;
  while (pending.length > 0 && inspected < 20_000) {
    inspected += 1;
    const candidate = pending.pop();
    if (Array.isArray(candidate)) {
      pending.push(...candidate);
    } else if (isRecord(candidate)) {
      if (hasJobPostingType(candidate["@type"])) return candidate;
      pending.push(...Object.values(candidate));
    }
  }
  return null;
}

function extractJobPosting(html: string): JobPostingMetadata {
  const scripts = html.matchAll(
    /<script\b[^>]*type\s*=\s*(?:["']application\/ld\+json["']|application\/ld\+json)[^>]*>([\s\S]*?)<\/script\s*>/gi,
  );
  for (const match of scripts) {
    try {
      const posting = findJobPosting(JSON.parse(match[1].trim()));
      if (!posting) continue;
      const organization = isRecord(posting.hiringOrganization) ? posting.hiringOrganization : null;
      return {
        title:
          typeof posting.title === "string"
            ? normalizeReadableText(decodeHtmlEntities(posting.title))
            : null,
        company:
          organization && typeof organization.name === "string"
            ? normalizeReadableText(decodeHtmlEntities(organization.name))
            : null,
        description: typeof posting.description === "string" ? posting.description : null,
      };
    } catch {
      // Broken third-party JSON-LD should not prevent a readable HTML fallback.
    }
  }
  return { title: null, company: null, description: null };
}

function firstHtmlMatch(html: string, expression: RegExp): string | null {
  const value = expression.exec(html)?.[1];
  return value ? htmlFragmentToText(value) : null;
}

function extractHtml(html: string): { text: string; title: string | null; company: string | null } {
  const metadata = extractJobPosting(html);
  if (metadata.description) {
    return {
      text: htmlFragmentToText(metadata.description),
      title: metadata.title,
      company: metadata.company,
    };
  }

  const primary =
    /<main\b[^>]*>([\s\S]*?)<\/main\s*>/i.exec(html)?.[1] ??
    /<article\b[^>]*>([\s\S]*?)<\/article\s*>/i.exec(html)?.[1] ??
    /<body\b[^>]*>([\s\S]*?)<\/body\s*>/i.exec(html)?.[1] ??
    html;
  return {
    text: htmlFragmentToText(primary),
    title:
      firstHtmlMatch(html, /<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/i) ??
      firstHtmlMatch(html, /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i),
    company: null,
  };
}

async function readResponseBody(
  response: JobUrlHttpResponse,
  maxBytes: number,
  url: URL,
  signal: AbortSignal,
  createAbortError: () => JobUrlImportError,
): Promise<{ bytes: Uint8Array; length: number }> {
  const advertisedLength = headerValue(response.headers, "content-length");
  if (advertisedLength && /^\d+$/.test(advertisedLength) && Number(advertisedLength) > maxBytes) {
    response.dispose?.();
    throw new JobUrlImportError("response_too_large", "Job page exceeds the configured byte limit", {
      url: url.toString(),
    });
  }

  const chunks: Uint8Array[] = [];
  let length = 0;
  const iterator = response.body[Symbol.asyncIterator]();
  try {
    for (;;) {
      const next = await raceWithAbort(iterator.next(), signal, createAbortError);
      if (next.done) break;
      const chunk = next.value;
      length += chunk.byteLength;
      if (length > maxBytes) {
        throw new JobUrlImportError("response_too_large", "Job page exceeds the configured byte limit", {
          url: url.toString(),
        });
      }
      chunks.push(chunk);
    }
  } finally {
    if (iterator.return) void iterator.return().catch(() => undefined);
    response.dispose?.();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes, length };
}

function configuredInteger(value: number | undefined, fallback: number, minimum: number): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new TypeError(`Expected a safe integer greater than or equal to ${minimum}`);
  }
  return value;
}

function raceWithAbort<T>(
  operation: Promise<T>,
  signal: AbortSignal,
  createAbortError: () => JobUrlImportError,
  disposeLateResult?: (result: T) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const onAbort = () => {
      if (settled) return;
      settled = true;
      reject(createAbortError());
    };
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });

    operation.then(
      (result) => {
        signal.removeEventListener("abort", onAbort);
        if (settled) {
          disposeLateResult?.(result);
          return;
        }
        settled = true;
        resolve(result);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        if (settled) return;
        settled = true;
        reject(error);
      },
    );
  });
}

/** Creates an SSRF-safe fetcher with injectable DNS/transport boundaries for deterministic tests. */
export function createJobDescriptionFetcher(runtime: JobUrlFetchRuntime): JobDescriptionFetcher {
  return async (input, options = {}) => {
    const timeoutMs = configuredInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS, 1);
    const maxBytes = configuredInteger(options.maxBytes, DEFAULT_MAX_BYTES, 1);
    const maxRedirects = configuredInteger(options.maxRedirects, DEFAULT_MAX_REDIRECTS, 0);
    const sourceUrl = parseUrl(input);
    let currentUrl = sourceUrl;
    let timedOut = false;
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort(options.signal?.reason);
    if (options.signal?.aborted) abortFromCaller();
    else options.signal?.addEventListener("abort", abortFromCaller, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort(new Error("Job URL import timed out"));
    }, timeoutMs);
    const createAbortError = () =>
      new JobUrlImportError(
        timedOut ? "timeout" : "aborted",
        timedOut ? "Job URL import timed out" : "Job URL import was aborted",
        { url: currentUrl.toString() },
      );

    try {
      for (let redirects = 0; ; redirects += 1) {
        if (controller.signal.aborted) {
          throw createAbortError();
        }
        const approvedAddresses = await approveUrl(
          currentUrl,
          runtime,
          controller.signal,
          createAbortError,
        );
        let response: JobUrlHttpResponse;
        try {
          response = await raceWithAbort(
            runtime.request({
              url: currentUrl,
              approvedAddresses,
              signal: controller.signal,
              headers: {
                accept: "text/html, application/xhtml+xml, text/plain;q=0.9",
                "accept-encoding": "identity",
                "user-agent": "PathfinderJobImporter/1.0",
              },
            }),
            controller.signal,
            createAbortError,
            (lateResponse) => lateResponse.dispose?.(),
          );
        } catch (cause) {
          if (cause instanceof JobUrlImportError) throw cause;
          if (controller.signal.aborted) {
            throw new JobUrlImportError(timedOut ? "timeout" : "aborted", timedOut ? "Job URL import timed out" : "Job URL import was aborted", {
              url: currentUrl.toString(),
              cause,
            });
          }
          throw new JobUrlImportError("transport_error", "Could not fetch the job URL", {
            url: currentUrl.toString(),
            cause,
          });
        }

        if (REDIRECT_STATUSES.has(response.status)) {
          if (redirects >= maxRedirects) {
            response.dispose?.();
            throw new JobUrlImportError("redirect_limit", "Job URL exceeded the redirect limit", {
              url: currentUrl.toString(),
              status: response.status,
            });
          }
          const location = headerValue(response.headers, "location");
          response.dispose?.();
          if (!location) {
            throw new JobUrlImportError("invalid_redirect", "Job URL redirect has no Location header", {
              url: currentUrl.toString(),
              status: response.status,
            });
          }
          try {
            currentUrl = parseUrl(new URL(location, currentUrl).toString());
          } catch (cause) {
            if (cause instanceof JobUrlImportError) throw cause;
            throw new JobUrlImportError("invalid_redirect", "Job URL redirect is invalid", {
              url: currentUrl.toString(),
              status: response.status,
              cause,
            });
          }
          continue;
        }

        if (response.status < 200 || response.status >= 300) {
          response.dispose?.();
          throw new JobUrlImportError("http_error", `Job URL returned HTTP ${response.status}`, {
            url: currentUrl.toString(),
            status: response.status,
          });
        }

        const encoding = headerValue(response.headers, "content-encoding")?.toLowerCase();
        if (encoding && encoding !== "identity") {
          response.dispose?.();
          throw new JobUrlImportError("unsupported_content_encoding", "Compressed job pages are not accepted", {
            url: currentUrl.toString(),
            status: response.status,
          });
        }
        const mediaType = headerValue(response.headers, "content-type")?.split(";", 1)[0].trim().toLowerCase();
        const isHtml = mediaType === "text/html" || mediaType === "application/xhtml+xml";
        const isText = mediaType === "text/plain";
        if (!isHtml && !isText) {
          response.dispose?.();
          throw new JobUrlImportError("unsupported_content_type", "Job URL must return HTML or plain text", {
            url: currentUrl.toString(),
            status: response.status,
          });
        }

        const body = await readResponseBody(
          response,
          maxBytes,
          currentUrl,
          controller.signal,
          createAbortError,
        );
        const decoded = new TextDecoder("utf-8", { fatal: false }).decode(body.bytes);
        const extracted = isHtml
          ? extractHtml(decoded)
          : { text: normalizeReadableText(decoded), title: null, company: null };
        if (!extracted.text) {
          throw new JobUrlImportError("empty_content", "Job URL did not contain readable text", {
            url: currentUrl.toString(),
            status: response.status,
          });
        }
        return {
          sourceUrl: sourceUrl.toString(),
          finalUrl: currentUrl.toString(),
          text: extracted.text,
          title: extracted.title,
          company: extracted.company,
          contentType: isHtml ? "html" : "text",
          bytes: body.length,
        };
      }
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abortFromCaller);
    }
  };
}

async function resolveHostname(hostname: string): Promise<readonly string[]> {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
}

const defaultRuntime: JobUrlFetchRuntime = {
  resolveHostname,
  request: async ({ url, approvedAddresses, signal, headers }) =>
    new Promise<JobUrlHttpResponse>((resolve, reject) => {
      const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
        url,
        {
          method: "GET",
          headers,
          signal,
          lookup: (_hostname, _options, callback) => {
            const address = approvedAddresses[0];
            callback(null, address, isIP(address));
          },
        },
        (incoming) => {
          resolve({
            status: incoming.statusCode ?? 0,
            headers: incoming.headers,
            body: (async function* () {
              for await (const chunk of incoming) {
                yield typeof chunk === "string" ? new TextEncoder().encode(chunk) : new Uint8Array(chunk);
              }
            })(),
            dispose: () => incoming.destroy(),
          });
        },
      );
      request.once("error", reject);
      request.end();
    }),
};

/** Server-side default fetcher. */
export const fetchJobDescription: JobDescriptionFetcher = (url, options) =>
  createJobDescriptionFetcher(defaultRuntime)(url, options);
