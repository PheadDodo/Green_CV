function publicSignupEnabled(): boolean {
  const value = process.env.ALLOW_PUBLIC_SIGNUP?.trim().toLowerCase();
  if (!value) return false;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error("ALLOW_PUBLIC_SIGNUP must be either true or false.");
}

function authorizedEmails(): Set<string> {
  return new Set(
    (process.env.AUTHORIZED_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** Production sign-up is private by default to protect personal data and API spend. */
export function isSignupEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" ||
    publicSignupEnabled() ||
    authorizedEmails().size > 0
  );
}

export function isEmailAllowedForSignup(email: string): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return publicSignupEnabled() || authorizedEmails().has(email.trim().toLowerCase());
}

/** Applied by every server-side auth guard, including users created outside the UI. */
export function isAccountAuthorized(email: string | null | undefined): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return Boolean(
    publicSignupEnabled() ||
      (email && authorizedEmails().has(email.trim().toLowerCase())),
  );
}
