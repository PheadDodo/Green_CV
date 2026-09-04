"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface DeleteApplicationProps {
  applicationId: string;
  jobTitle: string;
  company: string;
}

export function DeleteApplication({ applicationId, jobTitle, company }: DeleteApplicationProps) {
  const router = useRouter();
  const opener = useRef<HTMLButtonElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");
  const roleName = `${jobTitle} at ${company}`;

  function closeDialog() {
    if (isDeleting) return;
    setIsOpen(false);
    setError("");
    opener.current?.focus();
  }

  async function confirmDeletion() {
    if (isDeleting) return;
    setIsDeleting(true);
    setError("");
    try {
      const response = await fetch(`/api/applications/${encodeURIComponent(applicationId)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        let message = "Could not delete this application.";
        try {
          const body = await response.json() as { error?: unknown };
          if (typeof body.error === "string") message = body.error;
        } catch {
          // Keep the safe fallback when an intermediary returns a non-JSON response.
        }
        throw new Error(message);
      }
      router.replace("/applications");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete this application.");
    } finally {
      setIsDeleting(false);
    }
  }

  return <>
    <button
      ref={opener}
      type="button"
      className="button button-danger"
      aria-label={`Delete application for ${roleName}`}
      onClick={() => {
        setError("");
        setIsOpen(true);
      }}
    >
      Delete application
    </button>

    {isOpen && <div className="dialogBackdrop" onMouseDown={(event) => {
      if (event.currentTarget === event.target) closeDialog();
    }}>
      <section
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-application-title"
        aria-describedby="delete-application-description"
        onKeyDown={(event) => {
          if (event.key === "Escape") closeDialog();
        }}
      >
        <div className="dialogHeader">
          <div>
            <span className="eyebrow">Permanent deletion</span>
            <h2 id="delete-application-title">Delete {roleName}?</h2>
          </div>
        </div>
        <p id="delete-application-description">
          This permanently removes the job snapshot, timeline, reminders, and evaluation history.
          Your separate CV library entry will remain. This cannot be undone.
        </p>
        {error && <p className="formError" role="alert">{error}</p>}
        <div className="dialogActions">
          <button
            type="button"
            className="button button-ghost"
            autoFocus
            disabled={isDeleting}
            onClick={closeDialog}
          >
            Cancel
          </button>
          <button
            type="button"
            className="button button-danger"
            disabled={isDeleting}
            onClick={() => void confirmDeletion()}
          >
            {isDeleting ? "Deleting…" : "Delete application permanently"}
          </button>
        </div>
      </section>
    </div>}
  </>;
}
