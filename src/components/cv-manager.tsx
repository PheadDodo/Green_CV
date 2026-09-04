"use client";

import { FileText, UploadCloud, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "./ui";

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  try {
    return await response.json() as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function CvUploader() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");

  async function submit(formData: FormData) {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/cvs", { method: "POST", body: formData });
      if (!response.ok) {
        const body = await responseBody(response);
        setError(typeof body.error === "string" ? body.error : "Could not import this CV. Please try again.");
        return;
      }
      setOpen(false);
      setFileName("");
      router.refresh();
    } catch {
      setError("Could not import this CV. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return <><Button onClick={() => setOpen(true)}><UploadCloud size={16} />New CV version</Button>{open && <div className="dialogBackdrop" onMouseDown={event => event.currentTarget === event.target && setOpen(false)}><form className="dialog" action={submit}><div className="dialogHeader"><div><span className="eyebrow">Immutable resume version</span><h2>Import a CV</h2><p>PDF, DOCX, Markdown, and plain text are extracted server-side.</p></div><button type="button" className="iconButton" onClick={() => setOpen(false)}><X size={17} /></button></div>{error && <p className="formError" role="alert">{error}</p>}<div className="field"><label htmlFor="cv-name">Version name</label><input id="cv-name" name="name" placeholder="ML Engineer v4" required /></div><div className="dropzone" onClick={() => inputRef.current?.click()}><div><UploadCloud size={28} /><h3>{fileName || "Choose a CV file"}</h3><p>Private files up to 4 MB. The extracted text is what the evaluator reads.</p><input ref={inputRef} name="file" type="file" accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown" required onClick={event => event.stopPropagation()} onChange={event => setFileName(event.target.files?.[0]?.name ?? "")} /></div></div><div className="field" style={{ marginTop: 14 }}><label htmlFor="cv-summary">Positioning note (optional)</label><input id="cv-summary" name="summary" placeholder="Production ML, NLP, and MLOps" /></div><div className="dialogActions"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={pending || !fileName}>{pending ? "Extracting…" : "Create version"}</Button></div></form></div>}</>;
}

export function ManualCvForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  async function submit(formData: FormData) {
    setPending(true);
    setMessage("");
    setMessageIsError(false);
    try {
      const response = await fetch("/api/cvs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(formData.entries())) });
      if (!response.ok) {
        const body = await responseBody(response);
        setMessage(typeof body.error === "string" ? body.error : "Could not save CV text. Please try again.");
        setMessageIsError(true);
        return;
      }
      setMessage("CV version created.");
      router.refresh();
    } catch {
      setMessage("Could not save CV text. Please try again.");
      setMessageIsError(true);
    } finally {
      setPending(false);
    }
  }
  return <form action={submit}><div className="field"><label htmlFor="manual-name">Version name</label><input id="manual-name" name="name" required placeholder="Analytics v5" /></div><div className="field"><label htmlFor="manual-content">CV text</label><textarea id="manual-content" name="content" required minLength={30} placeholder="Paste the extracted CV text…" /></div>{message && <div className={messageIsError ? "formError" : "notice"} role={messageIsError ? "alert" : "status"}>{message}</div>}<Button disabled={pending}><FileText size={15} />{pending ? "Saving…" : "Save text version"}</Button></form>;
}
