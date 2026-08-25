"use client";

import { CalendarPlus, MessageSquarePlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "./ui";

export function ActivityRecorder({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [kind, setKind] = useState("note");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(formData: FormData) {
    setPending(true); setMessage("");
    const response = await fetch(`/api/applications/${applicationId}/events`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(formData.entries())) });
    const body = await response.json(); setPending(false);
    if (!response.ok) return setMessage(body.error ?? "Could not record activity.");
    setMessage("Activity recorded."); router.refresh();
  }

  return <form action={submit} style={{ marginTop: 20, paddingTop: 18, borderTop: "1px solid #dfe5df" }}><h2 className="sectionTitle">Record activity</h2><div className="field"><label htmlFor="activity-kind">Activity type</label><select id="activity-kind" name="kind" value={kind} onChange={event => setKind(event.target.value)}><option value="note">Note</option><option value="response">Recruiter response</option><option value="interview">Schedule interview</option><option value="follow_up">Follow-up sent</option></select></div>{kind === "interview" && <div className="field"><label htmlFor="interview-at">Interview time</label><input id="interview-at" name="interviewAt" type="datetime-local" required /></div>}<div className="field"><label htmlFor="activity-note">Notes</label><textarea id="activity-note" name="notes" style={{ minHeight: 80 }} placeholder="What happened, who replied, or what to prepare…" /></div>{message && <div className={message.includes("recorded") ? "notice" : "formError"}>{message}</div>}<Button variant="secondary" disabled={pending}>{kind === "interview" ? <CalendarPlus size={14} /> : <MessageSquarePlus size={14} />}{pending ? "Recording…" : "Add to timeline"}</Button></form>;
}
