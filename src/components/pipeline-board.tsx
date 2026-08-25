"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ApplicationRecord, ApplicationStatus } from "@/lib/data/types";
import { Badge } from "./ui";

const lanes: Array<{ status: ApplicationStatus; label: string }> = [
  { status: "saved", label: "Saved" },
  { status: "applied", label: "Applied" },
  { status: "screening", label: "Screening" },
  { status: "interview", label: "Interview" },
  { status: "offer", label: "Offer" }
];

const allStatuses: ApplicationStatus[] = ["saved", "applied", "screening", "interview", "offer", "rejected", "withdrawn", "archived"];

function toneFor(status: ApplicationStatus) {
  if (status === "interview" || status === "offer") return "green" as const;
  if (status === "screening") return "amber" as const;
  if (status === "rejected" || status === "withdrawn") return "red" as const;
  return "blue" as const;
}

export function PipelineBoard({ applications }: { applications: ApplicationRecord[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const visible = applications.filter(application => !["rejected", "withdrawn", "archived"].includes(application.status));

  async function updateStatus(id: string, status: ApplicationStatus) {
    setBusyId(id);
    const response = await fetch(`/api/applications/${id}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status })
    });
    setBusyId(null);
    if (response.ok) startTransition(() => router.refresh());
  }

  return <div className="pipelineBoard">
    {lanes.map(lane => {
      const items = visible.filter(application => application.status === lane.status);
      return <section className="pipelineLane" key={lane.status} aria-label={`${lane.label} applications`}>
        <div className="laneHeader"><strong>{lane.label}</strong><span>{items.length}</span></div>
        {items.map(application => <article className="applicationCard" key={application.id}>
          <div className="applicationCardTop"><span className="companyLogo">{application.job.company.slice(0,1).toUpperCase()}</span>{application.latestEvaluation?.overallScore != null && <span className="miniScore" title="Latest evidence fit score">{application.latestEvaluation.overallScore}</span>}</div>
          <h3>{application.job.title}</h3><p>{application.job.company} · {application.job.location || application.job.workplaceType}</p>
          <Badge tone={toneFor(application.status)}>{application.status}</Badge>
          <select className="statusSelect" aria-label={`Change ${application.job.title} status`} value={application.status} disabled={busyId === application.id} onChange={event => updateStatus(application.id, event.target.value as ApplicationStatus)}>
            {allStatuses.map(status => <option value={status} key={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}
          </select>
          <div className="cardFooter"><time>{new Date(application.lastActivityAt).toLocaleDateString("en", { month: "short", day: "numeric" })}</time><Link href={`/applications/${application.id}`}>Open →</Link></div>
        </article>)}
        {!items.length && <div className="laneInsight"><b>No roles here yet.</b><br />Stage changes will appear immediately.</div>}
        {lane.status === "interview" && items.length > 0 && <div className="laneInsight"><b>Prep signal</b><br />Turn each requirement into one concrete story before the interview.</div>}
      </section>;
    })}
  </div>;
}
