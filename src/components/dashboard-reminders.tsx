"use client";

import { Clock3 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Badge, Button } from "./ui";

export interface DashboardReminderDto {
  id: string;
  applicationId: string | null;
  title: string;
  dueAt: string;
}

export function DashboardReminders({
  reminders,
  nowIso,
}: {
  reminders: DashboardReminderDto[];
  nowIso: string;
}) {
  const router = useRouter();
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(() => new Set());
  const [activeActions, setActiveActions] = useState<Record<string, "completed" | "dismissed">>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [announcement, setAnnouncement] = useState("");
  const [focusRequest, setFocusRequest] = useState<{ target: string } | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const reminderRefs = useRef(new Map<string, HTMLElement>());
  const now = new Date(nowIso).getTime();
  const pendingReminders = reminders.filter(reminder => !resolvedIds.has(reminder.id));

  useEffect(() => {
    if (!focusRequest) return;
    if (focusRequest.target === "heading") {
      headingRef.current?.focus();
    } else {
      reminderRefs.current.get(focusRequest.target)?.focus();
    }
  }, [focusRequest]);

  async function resolveReminder(id: string, status: "completed" | "dismissed") {
    setAnnouncement("");
    setErrors(current => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setActiveActions(current => ({ ...current, [id]: status }));
    try {
      const response = await fetch(`/api/reminders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? `Could not ${status === "completed" ? "complete" : "dismiss"} this reminder.`);
      }
      const resolvedIndex = pendingReminders.findIndex(reminder => reminder.id === id);
      const remaining = pendingReminders.filter(reminder => reminder.id !== id);
      const nextReminder = remaining[Math.min(resolvedIndex, remaining.length - 1)];
      const title = pendingReminders[resolvedIndex]?.title ?? "Reminder";
      setAnnouncement(`${title} ${status === "completed" ? "marked complete" : "dismissed"}.`);
      setFocusRequest({ target: nextReminder?.id ?? "heading" });
      setResolvedIds(current => new Set(current).add(id));
      router.refresh();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not update this reminder.";
      setErrors(current => ({ ...current, [id]: message }));
    } finally {
      setActiveActions(current => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    }
  }

  return <article className="panel dashboardReminders">
    <div className="panelHeader">
      <div>
        <h2 ref={headingRef} tabIndex={-1}>Pending reminders</h2>
        <p>Generated from your activity and rules</p>
      </div>
      <Badge tone="amber" aria-label={pendingReminderLabel(pendingReminders.length)}>
        {pendingReminders.length}
      </Badge>
    </div>
    <div className="panelBody reminderList">
      <p className="reminderAnnouncement" aria-live="polite" aria-atomic="true">{announcement}</p>
      {!pendingReminders.length && <p className="notice reminderEmpty" role="status">
        You’re all caught up. No pending reminders.
      </p>}
      {pendingReminders.slice(0, 3).map((reminder) => {
        const overdue = new Date(reminder.dueAt).getTime() <= now;
        const activeAction = activeActions[reminder.id];
        const reminderError = errors[reminder.id];
        const errorId = `reminder-error-${reminder.id}`;
        return <article
          className={`reminderItem${overdue ? " reminderItemOverdue" : ""}`}
          aria-label={reminder.title}
          aria-busy={Boolean(activeAction)}
          tabIndex={-1}
          ref={(node) => {
            if (node) reminderRefs.current.set(reminder.id, node);
            else reminderRefs.current.delete(reminder.id);
          }}
          key={reminder.id}
        >
          <span className="timelineDot" aria-hidden="true"><Clock3 size={13} /></span>
          <div className="reminderDetails">
            <b>{reminder.title}</b>
            <time dateTime={reminder.dueAt}>{formatReminderDate(reminder.dueAt)}</time>
            {overdue && <Badge tone="red">Overdue</Badge>}
          </div>
          <div className="reminderActions">
            {reminder.applicationId && <Link
              className="button button-ghost reminderLink"
              href={`/applications/${reminder.applicationId}`}
              aria-label={`Open application for ${reminder.title}`}
            >Open application</Link>}
            <Button
              type="button"
              variant="secondary"
              aria-label={`${activeAction === "completed" ? "Completing" : "Complete"} ${reminder.title}`}
              aria-describedby={reminderError ? errorId : undefined}
              disabled={Boolean(activeAction)}
              onClick={() => resolveReminder(reminder.id, "completed")}
            >{activeAction === "completed" ? "Completing…" : "Complete"}</Button>
            <Button
              type="button"
              variant="ghost"
              aria-label={`${activeAction === "dismissed" ? "Dismissing" : "Dismiss"} ${reminder.title}`}
              aria-describedby={reminderError ? errorId : undefined}
              disabled={Boolean(activeAction)}
              onClick={() => resolveReminder(reminder.id, "dismissed")}
            >{activeAction === "dismissed" ? "Dismissing…" : "Dismiss"}</Button>
          </div>
          {reminderError && <p id={errorId} className="formError reminderError" role="alert">
            {reminderError}
          </p>}
        </article>;
      })}
    </div>
  </article>;
}

function pendingReminderLabel(count: number) {
  return `${count} pending reminder${count === 1 ? "" : "s"}`;
}

function formatReminderDate(value: string) {
  return new Date(value).toLocaleString("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}
