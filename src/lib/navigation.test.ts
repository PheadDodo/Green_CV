import { describe, expect, it } from "vitest";

import { getSafeRedirectPath } from "./navigation";

describe("getSafeRedirectPath", () => {
  it("keeps ordinary application paths, queries, and fragments", () => {
    expect(getSafeRedirectPath("/applications/123?tab=history#latest")).toBe(
      "/applications/123?tab=history#latest",
    );
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/%5cevil.example",
    "/%2f%2fevil.example",
    "/%2e%2e//evil.example",
    "/.//evil.example",
    "/foo/..//evil.example",
    "dashboard",
  ])("rejects unsafe redirect %s", (value) => {
    expect(getSafeRedirectPath(value)).toBe("/dashboard");
  });
});
