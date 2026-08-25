import { createHash } from "node:crypto";

export type IdempotencyDimension = string | number | boolean | null;

function assertNonEmpty(value: string, label: string): void {
  if (value.trim().length === 0) {
    throw new TypeError(`${label} must not be empty`);
  }
}

function encodeDimension(value: IdempotencyDimension): readonly [string, string | number | boolean] {
  if (value === null) return ["null", ""];
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Idempotency numbers must be finite");
    return ["number", value];
  }
  return [typeof value, value];
}

/**
 * Creates a bounded, non-sensitive key from a canonical tuple. Object key order
 * never affects the output, and primitive types remain distinct (1 !== "1").
 */
export function createAutomationIdempotencyKey(
  ruleId: string,
  dimensions: Readonly<Record<string, IdempotencyDimension>>,
): string {
  assertNonEmpty(ruleId, "ruleId");
  // Code-unit ordering is stable across machines; locale-aware sorting is not.
  const entries = Object.entries(dimensions).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  if (entries.length === 0) throw new TypeError("At least one idempotency dimension is required");

  const canonical = JSON.stringify([
    "automation-idempotency-v1",
    ruleId,
    entries.map(([key, value]) => {
      assertNonEmpty(key, "Idempotency dimension name");
      return [key, ...encodeDimension(value)] as const;
    }),
  ]);
  const digest = createHash("sha256").update(canonical, "utf8").digest("hex");
  const readableRuleId =
    ruleId
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "rule";

  return `automation:v1:${readableRuleId}:${digest}`;
}
