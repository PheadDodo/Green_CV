"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { AtsReport } from "@/lib/cv-artifacts";

export interface CvLibraryItemDto {
  id: string;
  name: string;
  fileName: string | null;
  mimeType: string | null;
  isDefault: boolean;
  createdAt: string;
  hasPdfPreview: boolean;
  atsReport: AtsReport;
}

export function CvLibrary({ cvs }: { cvs: CvLibraryItemDto[] }) {
  const router = useRouter();
  const [atsCv, setAtsCv] = useState<CvLibraryItemDto | null>(null);
  const [pdfCv, setPdfCv] = useState<CvLibraryItemDto | null>(null);
  const [deleteCv, setDeleteCv] = useState<CvLibraryItemDto | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);
  const [updatingSelectionCvId, setUpdatingSelectionCvId] = useState<string | null>(null);
  const [deletingCvId, setDeletingCvId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [selectedCvId, setSelectedCvId] = useState<string | null>(
    () => cvs.find(cv => cv.isDefault)?.id ?? null,
  );
  const [deletedCvIds, setDeletedCvIds] = useState<Set<string>>(() => new Set());
  const pdfRequest = useRef<AbortController | null>(null);
  const dialogOpener = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!pdfUrl) return;
    return () => URL.revokeObjectURL(pdfUrl);
  }, [pdfUrl]);

  useEffect(() => () => {
    pdfRequest.current?.abort();
    pdfRequest.current = null;
  }, []);

  function closePdf() {
    pdfRequest.current?.abort();
    pdfRequest.current = null;
    setPdfCv(null);
    setPdfUrl(null);
    setPdfError("");
    setPdfLoading(false);
    dialogOpener.current?.focus();
  }

  function closeAts() {
    setAtsCv(null);
    dialogOpener.current?.focus();
  }

  function closeDelete() {
    if (deletingCvId) return;
    setDeleteCv(null);
    setActionError("");
    dialogOpener.current?.focus();
  }

  async function openPdf(cv: CvLibraryItemDto, opener: HTMLButtonElement) {
    pdfRequest.current?.abort();
    const controller = new AbortController();
    pdfRequest.current = controller;
    dialogOpener.current = opener;
    setAtsCv(null);
    setPdfCv(cv);
    setPdfUrl(null);
    setPdfError("");
    setPdfLoading(true);
    try {
      const response = await fetch(`/api/cvs/${encodeURIComponent(cv.id)}/pdf`, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Could not load this PDF preview.");
      const blob = await response.blob();
      if (!controller.signal.aborted) setPdfUrl(URL.createObjectURL(blob));
    } catch (error) {
      if (!controller.signal.aborted) {
        setPdfError(error instanceof Error ? error.message : "Could not load this PDF preview.");
      }
    } finally {
      if (!controller.signal.aborted) setPdfLoading(false);
    }
  }

  async function updateCvSelection(cv: CvLibraryItemDto, isDefault: boolean) {
    const fallback = isDefault ? "Could not select this CV." : "Could not unselect this CV.";
    setUpdatingSelectionCvId(cv.id);
    setActionError("");
    try {
      const response = await fetch(`/api/cvs/${encodeURIComponent(cv.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDefault }),
      });
      if (!response.ok) throw new Error(fallback);
      setSelectedCvId(isDefault ? cv.id : null);
      router.refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : fallback);
    } finally {
      setUpdatingSelectionCvId(null);
    }
  }

  async function deleteSelectedCv(cv: CvLibraryItemDto) {
    setDeletingCvId(cv.id);
    setActionError("");
    try {
      const response = await fetch(`/api/cvs/${encodeURIComponent(cv.id)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        let message = "Could not delete this CV.";
        try {
          const body = await response.json() as { error?: unknown };
          if (typeof body.error === "string") message = body.error;
        } catch {
          // Keep the safe fallback when an intermediary returns a non-JSON response.
        }
        throw new Error(message);
      }
      setDeletedCvIds(current => new Set(current).add(cv.id));
      if (selectedCvId === cv.id) setSelectedCvId(null);
      setDeleteCv(null);
      router.refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not delete this CV.");
    } finally {
      setDeletingCvId(null);
    }
  }

  return <>
    {actionError && !deleteCv && <p className="formError" role="alert">{actionError}</p>}
    <div className="cvList">
      {cvs.filter(cv => !deletedCvIds.has(cv.id)).map((cv) => <article className="cvCard" key={cv.id}>
        <div className="cvCardDetails">
          <b>{cv.name}</b>
          <span>{cv.fileName ?? "Pasted text"}</span>
          {selectedCvId === cv.id && <span className="badge badge-green">Selected</span>}
        </div>
        <div className="cvCardActions">
          {selectedCvId === cv.id ? <button
            type="button"
            className="button button-ghost"
            aria-label={`Unselect CV for ${cv.name}`}
            disabled={updatingSelectionCvId !== null}
            onClick={() => void updateCvSelection(cv, false)}
          >
            {updatingSelectionCvId === cv.id ? "Unselecting…" : "Unselect CV"}
          </button> : <button
            type="button"
            className="button button-secondary"
            aria-label={`Select CV for ${cv.name}`}
            disabled={updatingSelectionCvId !== null}
            onClick={() => void updateCvSelection(cv, true)}
          >
            {updatingSelectionCvId === cv.id ? "Selecting…" : "Select CV"}
          </button>}
          {cv.hasPdfPreview && <button
            type="button"
            className="button button-ghost"
            aria-label={`View PDF for ${cv.name}`}
            onClick={(event) => void openPdf(cv, event.currentTarget)}
          >
            View PDF
          </button>}
          <button
            type="button"
            className="button button-secondary"
            aria-label={`ATS scan for ${cv.name}`}
            onClick={(event) => {
              dialogOpener.current = event.currentTarget;
              setAtsCv(cv);
            }}
          >
            ATS scan
          </button>
          <a
            className="button button-ghost"
            href={`/api/cvs/${encodeURIComponent(cv.id)}/markdown`}
            aria-label={`Download ${cv.name} as CV.md`}
            download
          >
            Download CV.md
          </a>
          <button
            type="button"
            className="button button-danger"
            aria-label={`Delete CV for ${cv.name}`}
            disabled={updatingSelectionCvId !== null || deletingCvId !== null}
            onClick={(event) => {
              dialogOpener.current = event.currentTarget;
              setActionError("");
              setDeleteCv(cv);
            }}
          >
            Delete
          </button>
        </div>
      </article>)}
    </div>

    {deleteCv && <div className="dialogBackdrop" onMouseDown={(event) => {
      if (event.currentTarget === event.target) closeDelete();
    }}>
      <section
        className="dialog cvLibraryDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-cv-title"
        onKeyDown={(event) => {
          if (event.key === "Escape") closeDelete();
        }}
      >
        <div className="dialogHeader">
          <div>
            <span className="eyebrow">Permanent deletion</span>
            <h2 id="delete-cv-title">Delete {deleteCv.name}?</h2>
          </div>
        </div>
        <p>
          This removes the original file and saved CV text, then detaches the CV from applications.
          Historical evaluation results, including quoted CV evidence, and activity will remain.
          This cannot be undone.
        </p>
        {selectedCvId === deleteCv.id && <p>Select another CV afterward to set a new default.</p>}
        {actionError && <p className="formError" role="alert">{actionError}</p>}
        <div className="dialogActions">
          <button
            type="button"
            className="button button-ghost"
            autoFocus
            disabled={deletingCvId !== null}
            onClick={closeDelete}
          >
            Cancel
          </button>
          <button
            type="button"
            className="button button-danger"
            disabled={deletingCvId !== null}
            onClick={() => void deleteSelectedCv(deleteCv)}
          >
            {deletingCvId === deleteCv.id ? "Deleting…" : "Delete CV permanently"}
          </button>
        </div>
      </section>
    </div>}

    {atsCv && <div className="dialogBackdrop" onMouseDown={(event) => {
      if (event.currentTarget === event.target) closeAts();
    }}>
      <section
        className="dialog cvLibraryDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ats-scan-title"
        onKeyDown={(event) => {
          if (event.key === "Escape") closeAts();
        }}
      >
        <div className="dialogHeader">
          <div>
            <span className="eyebrow">ATS compatibility</span>
            <h2 id="ats-scan-title">ATS scan for {atsCv.name}</h2>
          </div>
          <button
            type="button"
            className="iconButton"
            aria-label={`Close ATS scan for ${atsCv.name}`}
            autoFocus
            onClick={closeAts}
          >
            Close
          </button>
        </div>
        <div className="atsSummary">
          <strong>{atsCv.atsReport.score}/100</strong>
          <span>{atsCv.atsReport.rating}</span>
        </div>
        <ul className="atsChecks">
          {atsCv.atsReport.checks.map((check) => <li className={`atsCheck atsCheck-${check.status}`} key={check.id}>
            <div><b>{check.label}</b><span>{check.status}</span></div>
            <p>{check.message}</p>
          </li>)}
        </ul>
        <p className="atsDisclaimer">{atsCv.atsReport.disclaimer}</p>
      </section>
    </div>}

    {pdfCv && <div className="dialogBackdrop">
      <section
        className="dialog cvLibraryDialog cvPdfDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pdf-preview-title"
        onKeyDown={(event) => {
          if (event.key === "Escape") closePdf();
        }}
      >
        <div className="dialogHeader">
          <div>
            <span className="eyebrow">Private document</span>
            <h2 id="pdf-preview-title">PDF preview of {pdfCv.name}</h2>
          </div>
          <button
            type="button"
            className="iconButton"
            aria-label={`Close PDF preview of ${pdfCv.name}`}
            autoFocus
            onClick={closePdf}
          >
            Close
          </button>
        </div>
        {pdfLoading && <p role="status">Loading PDF preview...</p>}
        {pdfError && <p className="formError" role="alert">{pdfError}</p>}
        {pdfUrl && <iframe
          className="cvPdfFrame"
          src={pdfUrl}
          title={`PDF preview of ${pdfCv.name}`}
        />}
      </section>
    </div>}
  </>;
}
