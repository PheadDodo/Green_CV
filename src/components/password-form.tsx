"use client";

import { KeyRound } from "lucide-react";
import { useState } from "react";
import { Button } from "./ui";

export function PasswordForm() {
  const [message, setMessage] = useState(""); const [pending, setPending] = useState(false);
  async function submit(formData: FormData) {
    setPending(true); setMessage("");
    const password = String(formData.get("password") ?? ""); const confirmation = String(formData.get("confirmation") ?? "");
    if (password !== confirmation) { setPending(false); return setMessage("Passwords do not match."); }
    const response = await fetch("/api/auth/password", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) });
    const body = await response.json(); setPending(false); setMessage(response.ok ? "Password updated." : body.error ?? "Could not update password.");
  }
  return <form action={submit}><div className="field"><label htmlFor="password-new">New password</label><input id="password-new" name="password" type="password" minLength={8} required /></div><div className="field"><label htmlFor="password-confirm">Confirm password</label><input id="password-confirm" name="confirmation" type="password" minLength={8} required /></div>{message && <div className={message.includes("updated") ? "notice" : "formError"}>{message}</div>}<Button disabled={pending}><KeyRound size={14} />{pending ? "Updating…" : "Update password"}</Button></form>;
}
