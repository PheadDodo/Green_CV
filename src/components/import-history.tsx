"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import type { ImportBatch } from "@/lib/data/types";
import { Badge } from "./ui";

function batchName(batch: ImportBatch): string {
  return batch.fileName || `${batch.source} import`;
}

export function ImportHistory({ batches }: { batches: ImportBatch[] }) {
  const router = useRouter();
  const opener = useRef<HTMLButtonElement | null>(null);
  const [deletedBatchIds, setDeletedBatchIds] = useState<Set<string>>(() => new Set());
  const [batchToDelete, setBatchToDelete] = useState<ImportBatch | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");
  const history = batches.filter((batch) => !deletedBatchIds.has(batch.id));

  function closeDialog() {
    if (isDeleting) return;
    setBatchToDelete(null);
    setError("");
    opener.current?.focus();
  }

  async function confirmDeletion() {
    if (!batchToDelete || isDeleting) return;
    const deletingBatch = batchToDelete;
    setIsDeleting(true);
    setError("");
    try {
      const response = await fetch(`/api/imports/${encodeURIComponent(deletingBatch.id)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        let message = "Could not delete this import history.";
        try {
          const body = await response.json() as { error?: unknown };
          if (typeof body.error === "string") message = body.error;
        } catch {
          // Retain the safe fallback for non-JSON responses.
        }
        throw new Error(message);
      }
      setDeletedBatchIds((current) => new Set(current).add(deletingBatch.id));
      setBatchToDelete(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete this import history.");
    } finally {
      setIsDeleting(false);
    }
  }

  return <>
    <div className="panelBody runList">
      {history.map((batch) => <div className="runItem" key={batch.id}>
        <span className="timelineDot" aria-hidden="true">✓</span>
        <div>
          <b>{batchName(batch)}</b>
          <span>{batch.succeededRows}/{batch.totalRows} imported</span>
          <span>{new Date(batch.createdAt).toLocaleString()}</span>
          {batch.errors.length > 0 && <details>
            <summary>
              {batch.failedRows} failed {batch.failedRows === 1 ? "row" : "rows"}
              {" · "}{batch.errors.length} {batch.errors.length === 1 ? "issue" : "issues"}
            </summary>
            <ul>{batch.errors.map((error, index) => <li key={`${error.row}-${index}`}>
              Row {error.row}: {error.message}
            </li>)}</ul>
          </details>}
        </div>
        <div>
          <Badge tone={batch.status === "completed" ? "green" : batch.status === "failed" ? "red" : "amber"}>
            {batch.status}
          </Badge>
          <button
            ref={batchToDelete?.id === batch.id ? opener : undefined}
            type="button"
            className="iconButton"
            aria-label={`Delete import history for ${batchName(batch)}`}
            onClick={(event) => {
              opener.current = event.currentTarget;
              setError("");
              setBatchToDelete(batch);
            }}
          >
            <Trash2 size={15} aria-hidden="true" />
          </button>
        </div>
      </div>)}
      {!history.length && <p className="notice">No imports yet. Manual roles are not included here.</p>}
    </div>

    {batchToDelete && <div className="dialogBackdrop" onMouseDown={(event) => {
      if (event.currentTarget === event.target) closeDialog();
    }}>
      <section
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-import-history-title"
        aria-describedby="delete-import-history-description"
        onKeyDown={(event) => {
          if (event.key === "Escape") closeDialog();
        }}
      >
        <div className="dialogHeader">
          <div>
            <span className="eyebrow">Privacy control</span>
            <h2 id="delete-import-history-title">
              Delete import history for {batchName(batchToDelete)}?
            </h2>
          </div>
        </div>
        <p id="delete-import-history-description">
          This removes only the audit batch and its row-level error details. Imported applications
          will remain in your pipeline. This cannot be undone.
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
            {isDeleting ? "Deleting…" : "Delete import history permanently"}
          </button>
        </div>
      </section>
    </div>}
  </>;
}
