"use client";

import { Archive, Search, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { ApplicationRecord, ApplicationStatus } from "@/lib/data/types";
import { calculatePipelineSummary } from "@/lib/metrics";
import { Badge } from "./ui";

const lanes: Array<{ status: ApplicationStatus; label: string }> = [
  { status: "saved", label: "Saved" },
  { status: "applied", label: "Applied" },
  { status: "screening", label: "Screening" },
  { status: "interview", label: "Interview" },
  { status: "offer", label: "Offer" }
];

const allStatuses: ApplicationStatus[] = ["saved", "applied", "screening", "interview", "offer", "rejected", "withdrawn", "archived"];
const closedStatuses = new Set<ApplicationStatus>(["rejected", "withdrawn", "archived"]);
type RoleFilter = "all" | "open" | "closed" | ApplicationStatus;

function toneFor(status: ApplicationStatus) {
  if (status === "interview" || status === "offer") return "green" as const;
  if (status === "screening") return "amber" as const;
  if (status === "rejected" || status === "withdrawn") return "red" as const;
  return "blue" as const;
}

export function PipelineBoard({ applications }: { applications: ApplicationRecord[] }) {
  const router = useRouter();
  const [busyIds, setBusyIds] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RoleFilter>("all");
  const [error, setError] = useState("");
  const [, startTransition] = useTransition();
  const matching = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return applications.filter(application => {
      const isClosed = closedStatuses.has(application.status);
      const matchesFilter = filter === "all"
        || (filter === "open" && !isClosed)
        || (filter === "closed" && isClosed)
        || application.status === filter;
      if (!matchesFilter || !normalizedQuery) return matchesFilter;
      return [application.job.title, application.job.company, application.job.location, application.job.workplaceType, application.status]
        .filter(Boolean)
        .some(value => value!.toLocaleLowerCase().includes(normalizedQuery));
    });
  }, [applications, filter, query]);
  const openApplications = matching.filter(application => !closedStatuses.has(application.status));
  const closedApplications = matching.filter(application => closedStatuses.has(application.status));
  const visibleLanes = allStatuses.includes(filter as ApplicationStatus) && !closedStatuses.has(filter as ApplicationStatus)
    ? lanes.filter(lane => lane.status === filter)
    : lanes;
  const showOpen = filter !== "closed" && !closedStatuses.has(filter as ApplicationStatus);
  const showClosed = filter === "all" || filter === "closed" || closedStatuses.has(filter as ApplicationStatus);
  const narrowLanes = Boolean(query.trim()) || (filter !== "all" && filter !== "open");
  const lanesToRender = narrowLanes
    ? visibleLanes.filter(lane => openApplications.some(application => application.status === lane.status))
    : visibleLanes;
  const summary = calculatePipelineSummary(applications);

  async function updateStatus(id: string, status: ApplicationStatus) {
    setBusyIds((current) => new Set(current).add(id));
    setError("");
    try {
      const response = await fetch(`/api/applications/${id}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status })
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "Could not update this application.");
      }
      startTransition(() => router.refresh());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update this application.");
    } finally {
      setBusyIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }

  function applicationCard(application: ApplicationRecord) {
    return <article className="applicationCard" key={application.id}>
      <div className="applicationCardTop"><span className="companyLogo">{application.job.company.slice(0,1).toUpperCase()}</span>{application.latestEvaluation?.overallScore != null && <span className="miniScore" title="Latest evidence fit score">{application.latestEvaluation.overallScore}</span>}</div>
      <h3>{application.job.title}</h3><p>{application.job.company} · {application.job.location || application.job.workplaceType}</p>
      <Badge tone={toneFor(application.status)}>{application.status}</Badge>
      <select className="statusSelect" aria-label={`Change ${application.job.title} at ${application.job.company} in ${application.job.location || application.job.workplaceType} status`} value={application.status} disabled={busyIds.has(application.id)} onChange={event => updateStatus(application.id, event.target.value as ApplicationStatus)}>
        {allStatuses.map(status => <option value={status} key={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}
      </select>
      <div className="cardFooter"><time>{new Date(application.lastActivityAt).toLocaleDateString("en", { month: "short", day: "numeric" })}</time><Link href={`/applications/${application.id}`}>Open →</Link></div>
    </article>;
  }

  return <>
    <div className="pipelineSummary"><Badge tone="green">{summary.activeApplications} active</Badge><Badge tone="amber">{summary.interviews} interviewing</Badge><Badge>{matching.length === applications.length ? `${applications.length} total` : `${matching.length} of ${applications.length} shown`}</Badge></div>
    <section className="panel" aria-label="Application filters" style={{ padding: 14, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "end", gap: 10, flexWrap: "wrap" }}>
        <div className="field" style={{ flex: "1 1 260px", marginBottom: 0 }}>
          <label htmlFor="application-search">Search roles</label>
          <span style={{ position: "relative", display: "block" }}>
            <Search size={15} aria-hidden="true" style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }} />
            <input id="application-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Title, company, location, or status" style={{ paddingLeft: 34, paddingRight: query ? 36 : 11 }} />
            {query && <button type="button" className="iconButton" aria-label="Clear role search" onClick={() => setQuery("")} style={{ position: "absolute", right: 3, top: 3, width: 30, height: 30, border: 0, background: "transparent" }}><X size={14} /></button>}
          </span>
        </div>
        <div className="field" style={{ flex: "0 1 190px", marginBottom: 0 }}>
          <label htmlFor="application-filter">Filter by stage</label>
          <span style={{ position: "relative", display: "block" }}>
            <SlidersHorizontal size={15} aria-hidden="true" style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", pointerEvents: "none" }} />
            <select id="application-filter" value={filter} onChange={event => setFilter(event.target.value as RoleFilter)} style={{ width: "100%", minHeight: 37, padding: "8px 30px 8px 34px", border: "1px solid var(--line)", borderRadius: 10, background: "white", color: "var(--ink)" }}>
              <option value="all">All roles</option>
              <option value="open">Open roles</option>
              <option value="closed">Closed roles</option>
              {allStatuses.map(status => <option value={status} key={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}
            </select>
          </span>
        </div>
      </div>
      {error && <p className="formError" role="alert" style={{ margin: "11px 0 0" }}>{error}</p>}
    </section>
    {matching.length > 0 && showOpen && openApplications.length > 0 && <div className="pipelineBoard">
      {lanesToRender.map(lane => {
        const items = openApplications.filter(application => application.status === lane.status);
        return <section className="pipelineLane" key={lane.status} aria-label={`${lane.label} applications`}>
          <div className="laneHeader"><strong>{lane.label}</strong><span>{items.length}</span></div>
          {items.map(applicationCard)}
          {!items.length && <div className="laneInsight"><b>No matching roles.</b><br />Try another filter or search.</div>}
          {lane.status === "interview" && items.length > 0 && <div className="laneInsight"><b>Prep signal</b><br />Turn each requirement into one concrete story before the interview.</div>}
        </section>;
      })}
    </div>}
    {matching.length > 0 && showClosed && closedApplications.length > 0 && <details className="panel" style={{ marginTop: 15 }} open={filter === "closed" || closedStatuses.has(filter as ApplicationStatus) || (Boolean(query.trim()) && openApplications.length === 0) ? true : undefined}>
      <summary className="panelHeader" style={{ cursor: "pointer" }}><div><h2><Archive size={14} style={{ marginRight: 7, verticalAlign: "middle" }} />Closed applications</h2><p>Rejected, withdrawn, and archived records remain available and can be moved back to any stage.</p></div><Badge>{closedApplications.length}</Badge></summary>
      <div className="panelBody">
        <div className="pipelineBoard" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", overflow: "visible" }}>{closedApplications.map(applicationCard)}</div>
      </div>
    </details>}
    {matching.length === 0 && <div className="panel laneInsight" role="status"><b>No roles match these filters.</b><br />Clear the search or choose another stage.</div>}
  </>;
}
