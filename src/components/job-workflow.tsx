"use client";

import { FileCheck2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CvVersion } from "@/lib/data/types";
import { Button } from "./ui";

type CvChoice = Pick<CvVersion, "id" | "name" | "isDefault">;

export function JobWorkflow({ applicationId, currentCvId, cvs, hasEvaluation }: { applicationId: string; currentCvId: string | null; cvs: CvChoice[]; hasEvaluation: boolean }) {
  const router = useRouter();
  const [cvId, setCvId] = useState(currentCvId ?? cvs.find(cv => cv.isDefault)?.id ?? "");
  const [pending, setPending] = useState<"attach" | "evaluate" | null>(null);
  const [error, setError] = useState("");

  async function attach() {
    setPending("attach"); setError("");
    const response = await fetch(`/api/applications/${applicationId}/cv`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ cvVersionId: cvId || null }) });
    setPending(null);
    if (!response.ok) return setError((await response.json()).error ?? "Could not attach CV.");
    router.refresh();
  }

  async function evaluate() {
    if (!cvId) return setError("Attach a CV version before evaluating this role.");
    setPending("evaluate"); setError("");
    if (cvId !== currentCvId) {
      const attached = await fetch(`/api/applications/${applicationId}/cv`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ cvVersionId: cvId }) });
      if (!attached.ok) { setPending(null); return setError("Could not attach this CV."); }
    }
    const response = await fetch(`/api/applications/${applicationId}/evaluations`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ force: hasEvaluation }) });
    setPending(null);
    const body = await response.json();
    if (!response.ok) return setError(body.error ?? "Evaluation failed.");
    router.push(`/applications/${applicationId}/evaluation`); router.refresh();
  }

  return <div><div className="field"><label htmlFor="cv-workflow">CV version</label><select id="cv-workflow" value={cvId} onChange={event => setCvId(event.target.value)}><option value="">Choose a CV…</option>{cvs.map(cv => <option value={cv.id} key={cv.id}>{cv.name}</option>)}</select></div>{error && <p className="formError">{error}</p>}<div style={{ display: "grid", gap: 8 }}><Button variant="ghost" onClick={attach} disabled={pending !== null || cvId === (currentCvId ?? "")}><FileCheck2 size={15} />{pending === "attach" ? "Attaching…" : "Attach selected CV"}</Button><Button onClick={evaluate} disabled={pending !== null || !cvId}><Sparkles size={15} />{pending === "evaluate" ? "Evaluating evidence…" : hasEvaluation ? "Create new evaluation" : "Evaluate role fit"}</Button></div></div>;
}
