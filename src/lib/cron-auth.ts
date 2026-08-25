import { timingSafeEqual } from "node:crypto";

export type CronAuthorization = "authorized" | "unauthorized" | "misconfigured";

const KNOWN_PLACEHOLDERS = new Set([
  "replace-with-a-long-random-value",
  "change-me",
  "changeme",
]);

/** Validates scheduled requests without accepting short or published example secrets. */
export function verifyCronAuthorization(
  authorization: string | null,
  configuredSecret = process.env.CRON_SECRET,
): CronAuthorization {
  const secret = configuredSecret?.trim();
  if (!secret || secret.length < 32 || KNOWN_PLACEHOLDERS.has(secret.toLowerCase())) {
    return "misconfigured";
  }

  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(authorization ?? "");
  if (expected.length !== received.length) return "unauthorized";
  return timingSafeEqual(expected, received) ? "authorized" : "unauthorized";
}
