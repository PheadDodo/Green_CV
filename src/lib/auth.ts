import { DEMO_USER_EMAIL, DEMO_USER_ID } from "./data/seed";
import { isSupabaseConfigured } from "./supabase/env";
import { createClient } from "./supabase/server";
import { isAccountAuthorized } from "./signup-policy";

export interface AuthUser {
  id: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  isDemo: boolean;
}

export interface SignUpResult {
  user: AuthUser | null;
  requiresEmailConfirmation: boolean;
}

export class AuthRequiredError extends Error {
  constructor(message = "You must sign in to continue.") {
    super(message);
    this.name = "AuthRequiredError";
  }
}

export const DEMO_AUTH_USER: AuthUser = {
  id: DEMO_USER_ID,
  email: DEMO_USER_EMAIL,
  displayName: "Alex Morgan",
  avatarUrl: null,
  isDemo: true,
};

function mapSupabaseUser(user: {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}): AuthUser {
  const metadata = user.user_metadata ?? {};
  const displayName =
    typeof metadata.full_name === "string"
      ? metadata.full_name
      : typeof metadata.name === "string"
        ? metadata.name
        : null;
  const avatarUrl = typeof metadata.avatar_url === "string" ? metadata.avatar_url : null;
  return {
    id: user.id,
    email: user.email ?? null,
    displayName,
    avatarUrl,
    isDemo: false,
  };
}

/** Returns the local demo identity when Supabase environment variables are absent. */
export async function getCurrentUser(): Promise<AuthUser | null> {
  if (!isSupabaseConfigured()) return DEMO_AUTH_USER;
  const client = await createClient();
  const { data, error } = await client.auth.getUser();
  if (error) return null;
  if (!data.user || !isAccountAuthorized(data.user.email)) return null;
  return mapSupabaseUser(data.user);
}

export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthRequiredError();
  return user;
}

export async function getCurrentUserId(): Promise<string | null> {
  return (await getCurrentUser())?.id ?? null;
}

export async function signInWithPassword(email: string, password: string): Promise<AuthUser> {
  if (!isSupabaseConfigured()) return DEMO_AUTH_USER;
  const client = await createClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (!data.user) throw new AuthRequiredError("Sign in did not return a user.");
  if (!isAccountAuthorized(data.user.email)) {
    await client.auth.signOut();
    throw new AuthRequiredError("This account is not authorized for this workspace.");
  }
  return mapSupabaseUser(data.user);
}

export async function signUpWithPassword(
  email: string,
  password: string,
  displayName?: string,
  emailRedirectTo?: string,
): Promise<SignUpResult> {
  if (!isSupabaseConfigured()) return { user: DEMO_AUTH_USER, requiresEmailConfirmation: false };
  const client = await createClient();
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options:
      displayName || emailRedirectTo
        ? {
            ...(displayName ? { data: { full_name: displayName } } : {}),
            ...(emailRedirectTo ? { emailRedirectTo } : {}),
          }
        : undefined,
  });
  if (error) throw error;
  return {
    user: data.user ? mapSupabaseUser(data.user) : null,
    requiresEmailConfirmation: !data.session,
  };
}

export async function signOut(): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const client = await createClient();
  const { error } = await client.auth.signOut();
  if (error) throw error;
}
