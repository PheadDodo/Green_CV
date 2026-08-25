import { describe, expect, it, vi } from "vitest";

import {
  JobUrlImportError,
  createJobDescriptionFetcher,
  type JobUrlFetchRuntime,
} from "./url";

function response(
  status: number,
  headers: Record<string, string>,
  chunks: Array<string | Uint8Array> = [],
) {
  return {
    status,
    headers,
    body: (async function* () {
      for (const chunk of chunks) yield typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk;
    })(),
  };
}

describe("safe job-description URL import", () => {
  it("rejects non-HTTP, localhost, literal private, and DNS-resolved private destinations", async () => {
    const request = vi.fn<JobUrlFetchRuntime["request"]>();
    const fetchDescription = createJobDescriptionFetcher({
      resolveHostname: async (hostname) =>
        hostname === "internal.example" ? ["10.1.2.3"] : ["93.184.216.34"],
      request,
    });

    for (const url of [
      "file:///etc/passwd",
      "http://localhost/job",
      "http://127.0.0.1/job",
      "http://169.254.169.254/latest/meta-data",
      "http://[::1]/job",
      "http://[fe80::1]/job",
      "https://jobs.example:8443/job",
      "https://internal.example/job",
    ]) {
      await expect(fetchDescription(url)).rejects.toBeInstanceOf(JobUrlImportError);
    }
    expect(request).not.toHaveBeenCalled();
  });

  it("revalidates redirects and extracts readable JobPosting text and metadata", async () => {
    const fetchDescription = createJobDescriptionFetcher({
      resolveHostname: async () => ["93.184.216.34"],
      request: async ({ url }) => {
        if (url.hostname === "jobs.example") {
          return response(302, { location: "https://careers.example/openings/42" });
        }
        return response(
          200,
          { "content-type": "text/html; charset=utf-8", "content-length": "314" },
          [
            `<html><head><script type="application/ld+json">${JSON.stringify({
              "@type": "JobPosting",
              title: "ML Engineer",
              hiringOrganization: { name: "Acme" },
              description: "<p>Build <strong>reliable</strong> models.</p><p>Own evaluation.</p>",
            })}</script></head><body><nav>Navigation</nav><main>Fallback content</main></body></html>`,
          ],
        );
      },
    });

    await expect(fetchDescription("https://jobs.example/redirect")).resolves.toMatchObject({
      sourceUrl: "https://jobs.example/redirect",
      finalUrl: "https://careers.example/openings/42",
      title: "ML Engineer",
      company: "Acme",
      text: "Build reliable models.\nOwn evaluation.",
      contentType: "html",
    });
  });

  it("blocks a redirect that resolves to a private address", async () => {
    const request = vi.fn<JobUrlFetchRuntime["request"]>(async () =>
      response(302, { location: "http://metadata.internal.example/latest" }),
    );
    const fetchDescription = createJobDescriptionFetcher({
      resolveHostname: async (hostname) =>
        hostname === "metadata.internal.example" ? ["169.254.169.254"] : ["93.184.216.34"],
      request,
    });

    await expect(fetchDescription("https://jobs.example/42")).rejects.toMatchObject({
      code: "blocked_address",
    });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("enforces both advertised and streamed response size limits", async () => {
    const fetchAdvertised = createJobDescriptionFetcher({
      resolveHostname: async () => ["93.184.216.34"],
      request: async () =>
        response(200, { "content-type": "text/plain", "content-length": "100" }, ["small"]),
    });
    await expect(fetchAdvertised("https://jobs.example/42", { maxBytes: 5 })).rejects.toMatchObject({
      code: "response_too_large",
    });

    const fetchStreamed = createJobDescriptionFetcher({
      resolveHostname: async () => ["93.184.216.34"],
      request: async () => response(200, { "content-type": "text/plain" }, ["123", "456"]),
    });
    await expect(fetchStreamed("https://jobs.example/42", { maxBytes: 5 })).rejects.toMatchObject({
      code: "response_too_large",
    });
  });

  it("times out through an AbortSignal using a fake clock", async () => {
    vi.useFakeTimers();
    try {
      const fetchDescription = createJobDescriptionFetcher({
        resolveHostname: async () => ["93.184.216.34"],
        request: () => new Promise(() => undefined),
      });

      const pending = fetchDescription("https://jobs.example/42", { timeoutMs: 1_000 });
      const assertion = expect(pending).rejects.toMatchObject({ code: "timeout" });
      await vi.advanceTimersByTimeAsync(1_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("applies the same deadline while DNS resolution or a response body is stalled", async () => {
    vi.useFakeTimers();
    try {
      const dnsStalled = createJobDescriptionFetcher({
        resolveHostname: () => new Promise(() => undefined),
        request: async () => response(500, {}),
      });
      const dnsPending = dnsStalled("https://jobs.example/42", { timeoutMs: 500 });
      const dnsAssertion = expect(dnsPending).rejects.toMatchObject({ code: "timeout" });
      await vi.advanceTimersByTimeAsync(500);
      await dnsAssertion;

      const dispose = vi.fn();
      const bodyStalled = createJobDescriptionFetcher({
        resolveHostname: async () => ["93.184.216.34"],
        request: async () => ({
          ...response(200, { "content-type": "text/plain" }),
          body: (async function* () {
            yield new TextEncoder().encode("partial");
            await new Promise(() => undefined);
          })(),
          dispose,
        }),
      });
      const bodyPending = bodyStalled("https://jobs.example/42", { timeoutMs: 500 });
      const bodyAssertion = expect(bodyPending).rejects.toMatchObject({ code: "timeout" });
      await vi.advanceTimersByTimeAsync(500);
      await bodyAssertion;
      expect(dispose).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("falls back to the main HTML region and removes executable or navigational noise", async () => {
    const fetchDescription = createJobDescriptionFetcher({
      resolveHostname: async () => ["93.184.216.34"],
      request: async () =>
        response(200, { "content-type": "text/html" }, [
          "<html><body><nav>Ignore me</nav><main><h1>Data Scientist</h1><p>Analyze&nbsp;data &amp; experiments.</p><ul><li>Python</li><li>SQL</li></ul><script>steal()</script></main></body></html>",
        ]),
    });

    await expect(fetchDescription("https://jobs.example/42")).resolves.toMatchObject({
      title: "Data Scientist",
      text: "Data Scientist\nAnalyze data & experiments.\n• Python\n• SQL",
    });
  });

  it("rejects non-text responses instead of trying to interpret arbitrary bytes", async () => {
    const fetchDescription = createJobDescriptionFetcher({
      resolveHostname: async () => ["93.184.216.34"],
      request: async () => response(200, { "content-type": "application/pdf" }, ["%PDF"]),
    });
    await expect(fetchDescription("https://jobs.example/42")).rejects.toMatchObject({
      code: "unsupported_content_type",
    });
  });
});
