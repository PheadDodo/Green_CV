import { describe, expect, it } from "vitest";

import { verifyCronAuthorization } from "./cron-auth";

describe("verifyCronAuthorization", () => {
  const secret = "uP7jQx0Lu2nKb6Nw9Rz4Hv8Ms1Ta5Yc3";

  it("accepts only an exact bearer token", () => {
    expect(verifyCronAuthorization(`Bearer ${secret}`, secret)).toBe("authorized");
    expect(verifyCronAuthorization(`Bearer ${secret}x`, secret)).toBe("unauthorized");
    expect(verifyCronAuthorization(null, secret)).toBe("unauthorized");
  });

  it("rejects missing, short, and documented placeholder secrets", () => {
    expect(verifyCronAuthorization("Bearer anything", undefined)).toBe("misconfigured");
    expect(verifyCronAuthorization("Bearer short", "short")).toBe("misconfigured");
    expect(
      verifyCronAuthorization(
        "Bearer replace-with-a-long-random-value",
        "replace-with-a-long-random-value",
      ),
    ).toBe("misconfigured");
  });
});
