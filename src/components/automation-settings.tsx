"use client";

import { Ban, Play, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AutomationRule, AutomationRun } from "@/lib/data/types";
import { Badge, Button } from "./ui";

const copy = {
  auto_evaluate: { title: "Evaluate ready roles", description: "Run once a CV is attached and the preserved description is sufficient." },
  follow_up: { title: "Follow-up reminders", description: "Create a reminder after an application waits without an employer response." },
  interview_prep: { title: "Interview preparation", description: "Create a prep reminder before a scheduled interview." }
};

export function AutomationSettings({ initialRules, initialRuns }: { initialRules: AutomationRule[]; initialRuns: AutomationRun[] }) {
  const router = useRouter();
  const [rules, setRules] = useState(initialRules);
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function toggle(rule: AutomationRule) {
    setPending(rule.id); setMessage("");
    const response = await fetch("/api/automations/rules", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: rule.id, type: rule.type, enabled: !rule.enabled, config: rule.config }) });
    const body = await response.json(); setPending(null);
    if (!response.ok) return setMessage(body.error ?? "Could not update rule.");
    setRules(current => current.map(item => item.id === rule.id ? body.rule : item)); router.refresh();
  }

  async function runNow() {
    setPending("run"); setMessage("");
    const response = await fetch("/api/automations/run", { method: "POST" });
    const body = await response.json(); setPending(null);
    if (!response.ok) return setMessage(body.error ?? "Automation failed.");
    setMessage(`Checked ${body.evaluated} applications: ${body.succeeded} completed, ${body.failed} failed, ${body.skipped} already handled.`); router.refresh();
  }

  async function cancel(id: string) {
    setPending(id);
    const response = await fetch(`/api/automations/runs/${id}`, { method: "DELETE" }); setPending(null);
    if (!response.ok) return setMessage((await response.json()).error ?? "Could not cancel run.");
    router.refresh();
  }

  return <div className="splitGrid"><section className="panel"><div className="panelHeader"><div><h2>Automation rules</h2><p>Rules emit idempotent work. Repeated runs do not duplicate evaluations or reminders.</p></div><Button onClick={runNow} disabled={pending !== null}><Play size={14} />{pending === "run" ? "Running…" : "Run now"}</Button></div><div className="panelBody">{message && <div className={message.startsWith("Checked") ? "notice" : "formError"}>{message}</div>}{rules.map(rule => <article className="automationRule" key={rule.id}><div><h3>{copy[rule.type].title}</h3><p>{copy[rule.type].description}</p>{rule.type === "follow_up" && <Badge tone="blue">After {String(rule.config.delayDays ?? 7)} days</Badge>}{rule.type === "interview_prep" && <Badge tone="amber">{String(rule.config.leadHours ?? 24)}h before</Badge>}</div><button className={`switch ${rule.enabled ? "on" : ""}`} disabled={pending === rule.id} role="switch" aria-checked={rule.enabled} aria-label={`${rule.enabled ? "Disable" : "Enable"} ${copy[rule.type].title}`} onClick={() => toggle(rule)} /></article>)}</div></section>
    <aside className="panel"><div className="panelHeader"><div><h2>Run history</h2><p>Retries use exponential backoff and stop after four attempts.</p></div><RefreshCw size={16} /></div><div className="panelBody runList">{initialRuns.slice(0,12).map(run => <div className="runItem" key={run.id}><span className="timelineDot">{run.status === "failed" ? "!" : "✓"}</span><div><b>{copy[run.type].title}</b><span>Attempt {run.attempts} · {new Date(run.createdAt).toLocaleString()}{run.errorMessage ? ` · ${run.errorMessage}` : ""}</span></div><div style={{ display: "flex", gap: 5, alignItems: "center" }}><Badge tone={run.status === "succeeded" ? "green" : run.status === "failed" ? "red" : run.status === "running" ? "amber" : "neutral"}>{run.status}</Badge>{!["succeeded","cancelled"].includes(run.status) && <button className="iconButton" style={{ width: 28, height: 28 }} disabled={pending === run.id} onClick={() => cancel(run.id)} title="Cancel run"><Ban size={12} /></button>}</div></div>)}{!initialRuns.length && <div className="notice">No runs yet. Use “Run now” or wait for the daily schedule.</div>}</div></aside>
  </div>;
}
