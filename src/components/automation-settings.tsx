"use client";

import { Ban, Play, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  MAX_AUTOMATION_RUN_ATTEMPTS,
  type AutomationRule,
  type AutomationRun,
  type AutomationRuleType,
} from "@/lib/data/types";
import { Badge, Button } from "./ui";

const copy: Record<AutomationRuleType, { title: string; description: string }> = {
  auto_evaluate: {
    title: "Evaluate ready roles",
    description: "Run once a CV is attached and the preserved description is sufficient.",
  },
  follow_up: {
    title: "Follow-up reminders",
    description: "Create a reminder after an application waits without an employer response.",
  },
  interview_prep: {
    title: "Interview preparation",
    description: "Create a prep reminder before a scheduled interview.",
  },
};

function numericConfig(rule: AutomationRule | undefined, key: string, fallback: number) {
  const value = rule?.config[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  try {
    return await response.json() as Record<string, unknown>;
  } catch {
    return {};
  }
}

function isCancellableReminder(run: AutomationRun) {
  const isReminder = run.type === "follow_up" || run.type === "interview_prep";
  const isRetryableFailure =
    run.status === "failed" && run.attempts < MAX_AUTOMATION_RUN_ATTEMPTS;
  return isReminder && (run.status === "pending" || isRetryableFailure);
}

function cancellationLabel(run: AutomationRun) {
  const task = run.type === "follow_up" ? "follow-up reminder" : "interview preparation";
  return run.status === "pending"
    ? `Cancel pending ${task} run`
    : `Cancel ${task} retry`;
}

export function AutomationSettings({
  initialRules,
  initialRuns,
}: {
  initialRules: AutomationRule[];
  initialRuns: AutomationRun[];
}) {
  const router = useRouter();
  const [rules, setRules] = useState(initialRules);
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [followUpDays, setFollowUpDays] = useState(() => String(
    numericConfig(initialRules.find((rule) => rule.type === "follow_up"), "delayHours", 168) / 24,
  ));
  const [interviewLeadHours, setInterviewLeadHours] = useState(() => String(
    numericConfig(initialRules.find((rule) => rule.type === "interview_prep"), "leadHours", 24),
  ));

  function showMessage(value: string, isError = false) {
    setMessage(value);
    setMessageIsError(isError);
  }

  async function updateRule(
    rule: AutomationRule,
    update: { enabled: boolean; config?: Record<string, number> },
  ) {
    setPending(rule.id);
    showMessage("");
    try {
      const response = await fetch("/api/automations/rules", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: rule.id,
          type: rule.type,
          enabled: update.enabled,
          ...(update.config ? { config: update.config } : {}),
        }),
      });
      const body = await responseBody(response);
      if (!response.ok) {
        showMessage(
          typeof body.error === "string" ? body.error : "Could not update automation rule.",
          true,
        );
        return;
      }
      const updatedRule = body.rule as AutomationRule;
      setRules((current) => current.map((item) =>
        item.id === rule.id ? updatedRule : item,
      ));
      showMessage("Automation rule updated.");
      router.refresh();
    } catch {
      showMessage("Could not update automation rule.", true);
    } finally {
      setPending(null);
    }
  }

  async function toggle(rule: AutomationRule) {
    await updateRule(rule, { enabled: !rule.enabled });
  }

  async function saveFollowUp(rule: AutomationRule) {
    const days = Number(followUpDays);
    if (!Number.isInteger(days) || days < 1 || days > 30) {
      showMessage("Follow-up delay must be between 1 and 30 days.", true);
      return;
    }
    await updateRule(rule, { enabled: rule.enabled, config: { delayHours: days * 24 } });
  }

  async function saveInterviewLead(rule: AutomationRule) {
    const hours = Number(interviewLeadHours);
    if (!Number.isInteger(hours) || hours < 1 || hours > 168) {
      showMessage("Interview preparation lead time must be between 1 and 168 hours.", true);
      return;
    }
    await updateRule(rule, { enabled: rule.enabled, config: { leadHours: hours } });
  }

  async function runNow() {
    setPending("run");
    showMessage("");
    try {
      const response = await fetch("/api/automations/run", { method: "POST" });
      const body = await responseBody(response);
      if (!response.ok) {
        showMessage(
          typeof body.error === "string" ? body.error : "Automation failed.",
          true,
        );
        return;
      }
      showMessage(
        `Checked ${String(body.evaluated ?? 0)} applications: ${String(body.succeeded ?? 0)} completed, ${String(body.failed ?? 0)} failed, ${String(body.skipped ?? 0)} already handled.`,
      );
      router.refresh();
    } catch {
      showMessage("Automation failed.", true);
    } finally {
      setPending(null);
    }
  }

  async function cancel(run: AutomationRun) {
    setPending(run.id);
    showMessage("");
    try {
      const response = await fetch(`/api/automations/runs/${run.id}`, { method: "DELETE" });
      const body = await responseBody(response);
      if (!response.ok) {
        showMessage(
          typeof body.error === "string" ? body.error : "Could not cancel automation run.",
          true,
        );
        return;
      }
      showMessage("Automation run cancelled.");
      router.refresh();
    } catch {
      showMessage("Could not cancel automation run.", true);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="splitGrid">
      <section className="panel">
        <div className="panelHeader">
          <div>
            <h2>Automation rules</h2>
            <p>Reminder work is idempotent, so repeated runs do not create duplicates.</p>
          </div>
          <Button onClick={runNow} disabled={pending !== null}>
            <Play size={14} />
            {pending === "run" ? "Running…" : "Run now"}
          </Button>
        </div>
        <div className="panelBody">
          {message && (
            <div className={messageIsError ? "formError" : "notice"} role="status">
              {message}
            </div>
          )}
          {rules.map((rule) => (
            <article className="automationRule" key={rule.id}>
              <div>
                <h3>{copy[rule.type].title}</h3>
                <p>{copy[rule.type].description}</p>
                {rule.type === "follow_up" && (
                  <div className="field" style={{ marginTop: 10 }}>
                    <label htmlFor={`follow-up-delay-${rule.id}`}>Follow-up delay (days)</label>
                    <input
                      id={`follow-up-delay-${rule.id}`}
                      type="number"
                      min={1}
                      max={30}
                      step={1}
                      value={followUpDays}
                      onChange={(event) => setFollowUpDays(event.target.value)}
                      disabled={pending === rule.id}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => saveFollowUp(rule)}
                      disabled={pending === rule.id}
                      aria-label="Save follow-up timing"
                    >
                      Save timing
                    </Button>
                  </div>
                )}
                {rule.type === "interview_prep" && (
                  <div className="field" style={{ marginTop: 10 }}>
                    <label htmlFor={`interview-lead-${rule.id}`}>
                      Interview preparation lead time (hours)
                    </label>
                    <input
                      id={`interview-lead-${rule.id}`}
                      type="number"
                      min={1}
                      max={168}
                      step={1}
                      value={interviewLeadHours}
                      onChange={(event) => setInterviewLeadHours(event.target.value)}
                      disabled={pending === rule.id}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => saveInterviewLead(rule)}
                      disabled={pending === rule.id}
                      aria-label="Save interview preparation timing"
                    >
                      Save timing
                    </Button>
                  </div>
                )}
              </div>
              <button
                className={`switch ${rule.enabled ? "on" : ""}`}
                disabled={pending === rule.id}
                role="switch"
                aria-checked={rule.enabled}
                aria-label={`${rule.enabled ? "Disable" : "Enable"} ${copy[rule.type].title}`}
                onClick={() => toggle(rule)}
              />
            </article>
          ))}
        </div>
      </section>

      <aside className="panel">
        <div className="panelHeader">
          <div>
            <h2>Run history</h2>
            <p>Reminder retries use exponential backoff and stop after four attempts.</p>
          </div>
          <RefreshCw size={16} />
        </div>
        <div className="panelBody runList">
          {initialRuns.slice(0, 12).map((run) => (
            <div className="runItem" key={run.id}>
              <span className="timelineDot">{run.status === "failed" ? "!" : "✓"}</span>
              <div>
                <b>{copy[run.type].title}</b>
                <span>
                  Attempt {run.attempts} · {new Date(run.createdAt).toLocaleString()}
                </span>
              </div>
              <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                <Badge tone={
                  run.status === "succeeded"
                    ? "green"
                    : run.status === "failed"
                      ? "red"
                      : run.status === "running"
                        ? "amber"
                        : "neutral"
                }>
                  {run.status}
                </Badge>
                {isCancellableReminder(run) && (
                  <button
                    className="iconButton"
                    style={{ width: 28, height: 28 }}
                    disabled={pending === run.id}
                    onClick={() => cancel(run)}
                    aria-label={cancellationLabel(run)}
                    title={cancellationLabel(run)}
                  >
                    <Ban size={12} />
                  </button>
                )}
              </div>
            </div>
          ))}
          {!initialRuns.length && (
            <div className="notice">No runs yet. Use “Run now” or wait for the daily schedule.</div>
          )}
        </div>
      </aside>
    </div>
  );
}
