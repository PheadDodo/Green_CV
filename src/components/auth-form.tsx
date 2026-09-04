"use client";

import { ArrowRight, KeyRound, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "./logo";
import { Button } from "./ui";

type Mode = "signin" | "signup" | "recover";

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await response.json();
    return typeof body === "object" && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function AuthForm({
  configured,
  redirectTo = "/dashboard",
  signupEnabled = true,
  initialError = "",
}: {
  configured: boolean;
  redirectTo?: string;
  signupEnabled?: boolean;
  initialError?: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [error, setError] = useState(initialError);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(formData: FormData) {
    setPending(true);
    setError("");
    setMessage("");

    try {
      const endpoint = mode === "signup"
        ? "signup"
        : mode === "recover"
          ? "recover"
          : "login";
      const response = await fetch(`/api/auth/${endpoint}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.fromEntries(formData.entries())),
      });
      const body = await responseBody(response);
      if (!response.ok) {
        setError(typeof body.error === "string" ? body.error : "Authentication failed.");
        return;
      }
      if (typeof body.message === "string") {
        setMessage(body.message);
        return;
      }
      router.push(redirectTo);
      router.refresh();
    } catch {
      setError("Authentication failed.");
    } finally {
      setPending(false);
    }
  }

  if (!configured) return <div className="authForm"><Logo /><h2>Explore the demo</h2><p>Supabase is not configured, so GreenCV is running as a private local workspace with persistent demo data.</p><Button onClick={() => { router.push(redirectTo); router.refresh(); }}>Enter demo workspace <ArrowRight size={16} /></Button><div className="notice" style={{ marginTop: 18 }}>Add Supabase values to <code>.env.local</code> to enable real accounts and Row Level Security.</div></div>;

  return <form className="authForm" action={submit}>
    <Logo />
    <h2>{mode === "signin" ? "Welcome back" : mode === "signup" ? "Create your workspace" : "Reset your password"}</h2>
    <p>{mode === "signin" ? "Sign in to continue your search." : mode === "signup" ? "Your jobs, CVs, and evaluations stay private to your account." : "We will email you a secure recovery link."}</p>
    {error && <p className="formError" role="alert">{error}</p>}{message && <div className="notice">{message}</div>}
    {mode === "signup" && <div className="field"><label htmlFor="name">Name</label><input id="name" name="name" autoComplete="name" required /></div>}
    <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" required /></div>
    {mode !== "recover" && <div className="field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={8} required /></div>}
    <Button type="submit" disabled={pending}>{mode === "signin" ? <KeyRound size={15} /> : <UserPlus size={15} />}{pending ? "Please wait…" : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send recovery link"}</Button>
    <div className="authDivider">or</div>
    {(mode !== "signin" || signupEnabled) && <Button type="button" variant="ghost" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>{mode === "signin" ? "Create an account" : "Back to sign in"}</Button>}
    {mode === "signin" && <button type="button" style={{ border: 0, background: "none", color: "#287a5d", width: "100%", marginTop: 15, fontSize: 10 }} onClick={() => setMode("recover")}>Forgot password?</button>}
  </form>;
}
