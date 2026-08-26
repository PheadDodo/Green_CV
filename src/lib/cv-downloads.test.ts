import { describe, expect, it } from "vitest";
import { createCvMarkdownResponse, createCvPdfResponse } from "./cv-downloads";

describe("private CV artifact responses", () => {
  it("downloads canonical Markdown without exposing an uploaded filename", async () => {
    const response = createCvMarkdownResponse("# Private CV\n");

    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="CV.md"');
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await response.text()).toBe("# Private CV\n");
  });

  it("serves only explicitly supplied bytes as an inline PDF", async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
    const response = createCvPdfResponse(bytes);

    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe('inline; filename="CV.pdf"');
    expect(response.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });
});
