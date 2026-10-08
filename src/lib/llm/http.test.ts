import { EventEmitter } from "node:events";
import { createServer, type RequestOptions } from "node:http";
import { Readable } from "node:stream";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createLlmRequester, LlmHttpError, requestLlm, validateLlmBaseUrl, type LlmHttpResponse, type LlmHttpRuntime } from "./http";
import type { ResolvedLlmConfig } from "./types";

const network = vi.hoisted(() => ({ lookup: vi.fn(), httpsRequest: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: network.lookup }));
vi.mock("node:https", () => ({ request: network.httpsRequest }));

const api: ResolvedLlmConfig = {
  mode: "api", protocol: "openai", baseUrl: "https://api.example/v1", model: "example-model", apiKey: "secret-test-key", fingerprint: "api-test",
};
const local: ResolvedLlmConfig = { ...api, mode: "local", protocol: "ollama", baseUrl: "http://127.0.0.1:11434", apiKey: null };

function response(status = 200, headers: LlmHttpResponse["headers"] = { "content-type": "application/json" }, chunks: (string | Uint8Array)[] = ['{"ok":true}']): LlmHttpResponse {
  return { status, headers, body: (async function* () {
    for (const chunk of chunks) yield typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk;
  })() };
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  network.lookup.mockReset().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  network.httpsRequest.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("LLM endpoint validation", () => {
  it("retains configurable public API prefixes and permits development loopback ports", () => {
    expect(validateLlmBaseUrl("api", " https://api.example:8443/custom/v1/ ")).toBe("https://api.example:8443/custom/v1");
    expect(validateLlmBaseUrl("local", "http://localhost:1234/v1/")).toBe("http://localhost:1234/v1");
    expect(validateLlmBaseUrl("local", "http://[::1]:11434")).toBe("http://[::1]:11434");
  });

  it.each([
    "http://api.example/v1", "file:///secret", "https://user:secret@api.example", "https://api.example?key=secret", "https://api.example#secret", "https://api.example?", "https://api.example#", "https://api.exa\nmple", "https://localhost", "https://service.local", "https://metadata.google.internal", "https://127.0.0.1", "https://2130706433", "https://0x7f000001", "https://10.0.0.1", "https://100.64.0.1", "https://169.254.169.254", "https://192.168.1.1", "https://[::1]", "https://[::ffff:127.0.0.1]", "https://[fe80::1]", "https://[fc00::1]",
  ])("rejects unsafe API URL %s", (url) => {
    expect(() => validateLlmBaseUrl("api", url)).toThrow(LlmHttpError);
  });

  it.each(["http://192.168.1.1:1234", "https://api.example", "http://169.254.169.254", "http://localhost.evil.example", "http://service.local", "http://0.0.0.0:11434"])("rejects non-loopback local URL %s", (url) => {
    expect(() => validateLlmBaseUrl("local", url)).toThrow(LlmHttpError);
  });

  it("disables local requests in production before any networking", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const request = vi.fn<LlmHttpRuntime["request"]>();
    const requester = createLlmRequester({ resolveHostname: vi.fn(), request });
    await expect(requester(local, "api/tags")).rejects.toMatchObject({ code: "local_unavailable" });
    expect(request).not.toHaveBeenCalled();
  });
});

describe("LLM request security and limits", () => {
  it("appends paths and sends GET/JSON POST with the same approved public addresses", async () => {
    const request = vi.fn<LlmHttpRuntime["request"]>(async () => response());
    const resolveHostname = vi.fn(async () => ["93.184.216.34", "2606:4700:4700::1111"]);
    const requester = createLlmRequester({ resolveHostname, request });
    await expect(requester(api, "models")).resolves.toEqual({ ok: true });
    await expect(requester(api, "/chat/completions", { model: api.model }, { Authorization: "Bearer secret-test-key" })).resolves.toEqual({ ok: true });
    expect(request.mock.calls[0][0]).toMatchObject({ method: "GET", approvedAddresses: ["93.184.216.34", "2606:4700:4700::1111"] });
    expect(request.mock.calls[0][0].url.toString()).toBe("https://api.example/v1/models");
    expect(request.mock.calls[1][0]).toMatchObject({ method: "POST", body: '{"model":"example-model"}', headers: { authorization: "Bearer secret-test-key", "content-type": "application/json", "accept-encoding": "identity" } });
    expect(request.mock.calls[1][0].url.toString()).toBe("https://api.example/v1/chat/completions");
    expect(resolveHostname).toHaveBeenCalledTimes(2);
  });

  it("requires every resolved address to be public, including mixed DNS results", async () => {
    const request = vi.fn<LlmHttpRuntime["request"]>();
    for (const addresses of [["10.1.2.3"], ["169.254.169.254"], ["93.184.216.34", "192.168.1.1"], ["::ffff:127.0.0.1"], ["fe80::1"], ["not-an-ip"]]) {
      const requester = createLlmRequester({ resolveHostname: async () => addresses, request });
      await expect(requester(api, "models")).rejects.toMatchObject({ code: "blocked_address" });
    }
    expect(request).not.toHaveBeenCalled();
  });

  it("rejects localhost DNS rebinding to a non-loopback address", async () => {
    const request = vi.fn<LlmHttpRuntime["request"]>();
    const requester = createLlmRequester({ resolveHostname: async () => ["127.0.0.1", "10.1.2.3"], request });
    await expect(requester({ ...local, baseUrl: "http://localhost:11434" }, "api/tags")).rejects.toMatchObject({ code: "blocked_address" });
    expect(request).not.toHaveBeenCalled();
  });

  it("redacts DNS and transport exceptions without retaining their causes", async () => {
    for (const runtime of [
      { resolveHostname: async () => { throw new Error("secret-test-key in DNS error"); }, request: vi.fn() },
      { resolveHostname: async () => ["93.184.216.34"], request: async () => { throw new Error("secret-test-key in connection error"); } },
    ]) {
      const error = await createLlmRequester(runtime)(api, "models").catch((value: unknown) => value);
      expect(error).toBeInstanceOf(LlmHttpError);
      expect(String(error)).not.toContain("secret-test-key");
      expect(error).not.toHaveProperty("cause");
    }
  });

  it.each(["https://evil.example", "//evil.example/models", "../models", "models/../secret", "models?key=secret", "models#secret", "models%2fsecret", "models\\secret"])("rejects unsafe request path %s before DNS", async (path) => {
    const resolveHostname = vi.fn();
    const requester = createLlmRequester({ resolveHostname, request: vi.fn() });
    await expect(requester(api, path)).rejects.toMatchObject({ code: "invalid_request" });
    expect(resolveHostname).not.toHaveBeenCalled();
  });

  it("rejects credential header injection and protected transport headers before DNS", async () => {
    const resolveHostname = vi.fn();
    const requester = createLlmRequester({ resolveHostname, request: vi.fn() });
    const unsafeHeaders: Record<string, string>[] = [{ Authorization: "Bearer secret\r\nHost: internal" }, { Host: "internal.example" }, { "bad\nname": "secret" }, { "Accept-Encoding": "gzip" }];
    for (const headers of unsafeHeaders) {
      await expect(requester(api, "models", undefined, headers)).rejects.toMatchObject({ code: "invalid_request" });
    }
    expect(resolveHostname).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON requests before DNS", async () => {
    const resolveHostname = vi.fn();
    const requester = createLlmRequester({ resolveHostname, request: vi.fn() });
    await expect(requester(api, "models", BigInt(1))).rejects.toMatchObject({ code: "invalid_request" });
    expect(resolveHostname).not.toHaveBeenCalled();
  });

  it("does not follow redirects or forward credentials to redirect targets", async () => {
    const dispose = vi.fn();
    const request = vi.fn<LlmHttpRuntime["request"]>(async () => ({ ...response(302, { location: "http://169.254.169.254/secret" }), dispose }));
    const requester = createLlmRequester({ resolveHostname: async () => ["93.184.216.34"], request });
    await expect(requester(api, "models", undefined, { authorization: "Bearer secret-test-key" })).rejects.toMatchObject({ code: "redirect" });
    expect(request).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("does not read upstream error bodies or retry unsuccessful requests", async () => {
    const readBody = vi.fn();
    const dispose = vi.fn();
    const request = vi.fn<LlmHttpRuntime["request"]>(async () => ({ ...response(401), dispose, body: { [Symbol.asyncIterator]: readBody } }));
    const error = await createLlmRequester({ resolveHostname: async () => ["93.184.216.34"], request })(api, "models").catch((value: unknown) => value);
    expect(error).toMatchObject({ code: "http_error", status: 401 });
    expect(String(error)).not.toContain("secret-test-key");
    expect(readBody).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("limits both advertised and streamed response size and disposes the connection", async () => {
    for (const upstream of [response(200, { "content-length": "1048577" }), response(200, {}, [new Uint8Array(1024 * 1024), "x"])]) {
      const dispose = vi.fn();
      const requester = createLlmRequester({ resolveHostname: async () => ["93.184.216.34"], request: async () => ({ ...upstream, dispose }) });
      await expect(requester(api, "models")).rejects.toMatchObject({ code: "response_too_large" });
      expect(dispose).toHaveBeenCalledOnce();
    }
  });

  it("rejects non-JSON and compressed responses with redacted errors", async () => {
    for (const upstream of [response(200, {}, ["secret-test-key invalid JSON"]), response(200, { "content-type": "text/html" }), response(200, { "content-encoding": "gzip" })]) {
      const error = await createLlmRequester({ resolveHostname: async () => ["93.184.216.34"], request: async () => upstream })(api, "models").catch((value: unknown) => value);
      expect(error).toMatchObject({ code: "invalid_response" });
      expect(String(error)).not.toContain("secret-test-key");
    }
  });

  it("applies the API deadline to stalled DNS, connections, and response streams", async () => {
    vi.useFakeTimers();
    const dispose = vi.fn();
    const stalledBody: LlmHttpResponse = { ...response(), dispose, body: { [Symbol.asyncIterator]: () => ({ next: () => new Promise(() => undefined) }) } };
    for (const runtime of [
      { resolveHostname: () => new Promise<readonly string[]>(() => undefined), request: vi.fn<LlmHttpRuntime["request"]>() },
      { resolveHostname: async () => ["93.184.216.34"], request: () => new Promise<LlmHttpResponse>(() => undefined) },
      { resolveHostname: async () => ["93.184.216.34"], request: async () => stalledBody },
    ]) {
      const pending = createLlmRequester(runtime)(api, "models");
      const assertion = expect(pending).rejects.toMatchObject({ code: "timeout" });
      await vi.advanceTimersByTimeAsync(60_000);
      await assertion;
    }
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("uses the longer local deadline and aborts the active connection", async () => {
    vi.useFakeTimers();
    const request = vi.fn<LlmHttpRuntime["request"]>(() => new Promise(() => undefined));
    const pending = createLlmRequester({ resolveHostname: vi.fn(), request })(local, "api/tags");
    const assertion = expect(pending).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(89_999);
    expect(request.mock.calls[0][0].signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
    expect(request.mock.calls[0][0].signal.aborted).toBe(true);
  });

  it("disposes a connection that finishes after the deadline", async () => {
    vi.useFakeTimers();
    const dispose = vi.fn();
    let finish!: (value: LlmHttpResponse) => void;
    const requester = createLlmRequester({ resolveHostname: async () => ["93.184.216.34"], request: () => new Promise((resolve) => { finish = resolve; }) });
    const pending = requester(api, "models");
    const assertion = expect(pending).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(60_000);
    await assertion;
    finish({ ...response(), dispose });
    await Promise.resolve();
    expect(dispose).toHaveBeenCalledOnce();
  });
});

describe("default Node transport", () => {
  it("pins HTTPS lookup to the validated address while retaining the TLS hostname", async () => {
    let connectedAddress: unknown;
    let writtenBody: unknown;
    network.httpsRequest.mockImplementation((_url: URL, options: RequestOptions, callback: (incoming: Readable) => void) => {
      options.lookup!("api.example", {}, (_error: Error | null, address: unknown) => { connectedAddress = address; });
      const outgoing = new EventEmitter();
      return Object.assign(outgoing, { end: (body: unknown) => {
        writtenBody = body;
        callback(Object.assign(Readable.from(['{"ok":true}']), { statusCode: 200, headers: { "content-type": "application/json" } }));
      } });
    });
    await expect(requestLlm(api, "chat/completions", { model: api.model })).resolves.toEqual({ ok: true });
    expect(network.lookup).toHaveBeenCalledExactlyOnceWith("api.example", { all: true, verbatim: true });
    expect(network.httpsRequest.mock.calls[0][0].hostname).toBe("api.example");
    expect(network.httpsRequest.mock.calls[0][1]).toMatchObject({ agent: false, autoSelectFamily: false, family: 4, method: "POST" });
    expect(connectedAddress).toBe("93.184.216.34");
    expect(writtenBody).toBe('{"model":"example-model"}');
    network.lookup.mockResolvedValue([{ address: "169.254.169.254", family: 4 }]);
    await expect(requestLlm(api, "models")).rejects.toMatchObject({ code: "blocked_address" });
    expect(network.httpsRequest).toHaveBeenCalledOnce();
  });

  it("connects to a real loopback server and sends GET and POST without public DNS", async () => {
    const requests: { method: string | undefined; path: string | undefined; body: string }[] = [];
    const server = createServer(async (incoming, outgoing) => {
      let body = "";
      for await (const chunk of incoming) body += String(chunk);
      requests.push({ method: incoming.method, path: incoming.url, body });
      outgoing.writeHead(200, { "Content-Type": "application/json" });
      outgoing.end('{"models":[]}');
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Missing server port");
      const config = { ...local, baseUrl: "http://127.0.0.1:" + address.port + "/custom" };
      await expect(requestLlm(config, "api/tags")).resolves.toEqual({ models: [] });
      await requestLlm(config, "api/chat", { model: config.model });
      expect(requests).toEqual([
        { method: "GET", path: "/custom/api/tags", body: "" },
        { method: "POST", path: "/custom/api/chat", body: '{"model":"example-model"}' },
      ]);
      expect(network.lookup).not.toHaveBeenCalled();
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
