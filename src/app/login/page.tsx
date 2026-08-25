import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { AuthForm } from "@/components/auth-form";
import { getCurrentUser } from "@/lib/auth";
import { getSafeRedirectPath } from "@/lib/navigation";
import { isSignupEnabled } from "@/lib/signup-policy";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const configured = isSupabaseConfigured();
  const viewer = await getCurrentUser();
  if (configured && viewer) redirect("/dashboard");
  const params = await searchParams;
  const next = getSafeRedirectPath(params.next);
  const initialError = params.error === "auth_callback_failed"
    ? "That authentication link could not be completed. Request a new link and try again."
    : params.error === "invalid_auth_link"
      ? "That authentication link is incomplete or expired."
      : "";
  return <main className="authPage">
    <section className="authStory"><Logo /><div><span className="eyebrow" style={{ color: "#f4c653" }}>Job-search intelligence</span><h1>Make every application count.</h1><p>Preserve the role, choose the right CV, evaluate the real evidence, and learn from every response.</p></div><div className="authQuote">“The tracker records what happened. GreenCV helps explain why—and what to do next.”</div></section>
    <section className="authFormWrap"><AuthForm configured={configured} redirectTo={next} signupEnabled={isSignupEnabled()} initialError={initialError} /></section>
  </main>;
}
