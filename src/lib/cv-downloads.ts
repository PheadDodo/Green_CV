const PRIVATE_ARTIFACT_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Resource-Policy": "same-origin",
} as const;

export function createCvMarkdownResponse(markdown: string): Response {
  return new Response(markdown, {
    headers: {
      ...PRIVATE_ARTIFACT_HEADERS,
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": 'attachment; filename="CV.md"',
    },
  });
}

export function createCvPdfResponse(bytes: Uint8Array): Response {
  const body = Uint8Array.from(bytes).buffer;
  return new Response(body, {
    headers: {
      ...PRIVATE_ARTIFACT_HEADERS,
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="CV.pdf"',
      "Content-Length": String(bytes.byteLength),
    },
  });
}
