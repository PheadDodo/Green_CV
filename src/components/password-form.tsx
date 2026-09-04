"use client";

import { KeyRound } from "lucide-react";
import { useState } from "react";

import { Button } from "./ui";

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  try {
    return await response.json() as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function PasswordForm({ configured }: { configured: boolean }) {
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [pending, setPending] = useState(false);

  if (!configured) {
    return <div className="notice">
      Password management is available after Supabase accounts are configured.
    </div>;
  }

  async function submit(formData: FormData) {
    setPending(true);
    setMessage("");
    setMessageIsError(false);
    try {
      const password = String(formData.get("password") ?? "");
      const confirmation = String(formData.get("confirmation") ?? "");
      if (password !== confirmation) {
        setMessage("Passwords do not match.");
        setMessageIsError(true);
        return;
      }

      const response = await fetch("/api/auth/password", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = await responseBody(response);
      if (!response.ok) {
        setMessage(typeof body.error === "string" ? body.error : "Could not update password.");
        setMessageIsError(true);
        return;
      }
      setMessage("Password updated.");
    } catch {
      setMessage("Could not update password.");
      setMessageIsError(true);
    } finally {
      setPending(false);
    }
  }

  return <form action={submit}>
    <div className="field">
      <label htmlFor="password-new">New password</label>
      <input id="password-new" name="password" type="password" minLength={8} required />
    </div>
    <div className="field">
      <label htmlFor="password-confirm">Confirm password</label>
      <input id="password-confirm" name="confirmation" type="password" minLength={8} required />
    </div>
    {message && <div className={messageIsError ? "formError" : "notice"} role="status">
      {message}
    </div>}
    <Button disabled={pending}>
      <KeyRound size={14} />
      {pending ? "Updating…" : "Update password"}
    </Button>
  </form>;
}
