import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { AuthForm } from "@/components/auth-form";
import { getCurrentUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const configured = isSupabaseConfigured();
  const viewer = await getCurrentUser();
  if (configured && viewer) redirect("/dashboard");
  const requestedNext = (await searchParams).next;
  const next = requestedNext?.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/dashboard";
  return <main className="authPage">
    <section className="authStory"><Logo /><div><span className="eyebrow" style={{ color: "#f4c653" }}>Job-search intelligence</span><h1>Make every application count.</h1><p>Preserve the role, choose the right CV, evaluate the real evidence, and learn from every response.</p></div><div className="authQuote">“The tracker records what happened. Pathfinder helps explain why—and what to do next.”</div></section>
    <section className="authFormWrap"><AuthForm configured={configured} redirectTo={next} /></section>
  </main>;
}
