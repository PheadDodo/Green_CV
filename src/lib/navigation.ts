const REDIRECT_BASE = "https://greencv.invalid";

/**
 * Accepts only same-origin path redirects. Backslashes and encoded path
 * separators are rejected because URL parsers can interpret them as a host.
 */
export function getSafeRedirectPath(
  value: string | null | undefined,
  fallback = "/dashboard",
): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /%(?:2f|5c)/i.test(value) ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return fallback;
  }

  try {
    const target = new URL(value, REDIRECT_BASE);
    if (target.origin !== REDIRECT_BASE || target.pathname.startsWith("//")) return fallback;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
}
