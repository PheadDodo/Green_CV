"use client";

import { FileSpreadsheet, Globe2, Import, Link2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { JobCreateInput } from "@/lib/data/types";
import { Badge, Button } from "./ui";

type Tab = "csv" | "url";

export function ImportWorkspace() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("csv");
  const [preview, setPreview] = useState<JobCreateInput[]>([]);
  const [errors, setErrors] = useState<Array<{ row?: number; message: string }>>([]);
  const [urlPreview, setUrlPreview] = useState<{ title: string; company: string; description: string; sourceUrl: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function previewCsv(formData: FormData) {
    const file = formData.get("file"); if (!(file instanceof File)) return;
    setPending(true); setMessage(""); setPreview([]); setErrors([]);
    const csv = await file.text();
    const response = await fetch("/api/imports/csv", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ csv, fileName: file.name, commit: false }) });
    const body = await response.json(); setPending(false);
    if (!response.ok) return setMessage(body.error ?? "Could not parse this CSV.");
    setPreview(body.jobs); setErrors(body.errors);
  }

  async function commitCsv() {
    setPending(true);
    const response = await fetch("/api/imports/csv", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobs: preview, fileName: "reviewed-import.csv", commit: true }) });
    const body = await response.json(); setPending(false);
    if (!response.ok) return setMessage(body.error ?? "Import failed.");
    setMessage(`Imported ${body.applications.length} roles${body.errors.length ? `; ${body.errors.length} rows failed` : ""}.`); setPreview([]); router.refresh();
  }

  async function previewUrl(formData: FormData) {
    setPending(true); setMessage(""); setUrlPreview(null);
    const response = await fetch("/api/imports/url", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: formData.get("url") }) });
    const body = await response.json(); setPending(false);
    if (!response.ok) return setMessage(body.error ?? "Could not read this URL. Paste the job manually instead.");
    setUrlPreview({ title: body.job.title ?? "", company: body.job.company ?? "", description: body.job.text, sourceUrl: body.job.finalUrl });
  }

  async function saveUrl(formData: FormData) {
    setPending(true);
    const response = await fetch("/api/applications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...Object.fromEntries(formData.entries()), sourceUrl: urlPreview?.sourceUrl, workplaceType: "unspecified", employmentType: "full_time", status: "saved" }) });
    const body = await response.json(); setPending(false);
    if (!response.ok) return setMessage(body.error ?? "Could not save the imported job.");
    router.push(`/applications/${body.application.id}`); router.refresh();
  }

  return <section className="panel"><div className="panelHeader"><div><h2>Bring in existing opportunities</h2><p>Every import is previewed and validated before it changes your pipeline.</p></div></div><div className="panelBody">
    <div className="tabBar"><button className={tab === "csv" ? "active" : ""} onClick={() => { setTab("csv"); setMessage(""); }}><FileSpreadsheet size={13} /> CSV file</button><button className={tab === "url" ? "active" : ""} onClick={() => { setTab("url"); setMessage(""); }}><Globe2 size={13} /> Job URL</button></div>
    {message && <div className={message.startsWith("Imported") ? "notice" : "formError"}>{message}</div>}
    {tab === "csv" ? <div>
      <form action={previewCsv}><div className="dropzone"><div><FileSpreadsheet size={28} /><h3>Upload a jobs CSV</h3><p>Required columns: title, company, and description. Optional location, URL, employment type, and salary columns are recognized.</p><input type="file" name="file" accept=".csv,text/csv" required /></div></div><div className="dialogActions" style={{ marginTop: 12 }}><a className="button button-ghost" href="/sample-jobs.csv" download>Download template</a><Button disabled={pending}><Import size={14} />{pending ? "Validating…" : "Preview rows"}</Button></div></form>
      {(preview.length > 0 || errors.length > 0) && <div style={{ overflowX: "auto", marginTop: 20 }}><div className="pipelineSummary"><Badge tone="green">{preview.length} valid</Badge><Badge tone={errors.length ? "red" : "neutral"}>{errors.length} errors</Badge></div><table className="previewTable"><thead><tr><th>Company</th><th>Role</th><th>Location</th><th>Description</th></tr></thead><tbody>{preview.map((job,index) => <tr key={`${job.company}-${job.title}-${index}`}><td>{job.company}</td><td>{job.title}</td><td>{job.location || "—"}</td><td>{job.description.slice(0,100)}…</td></tr>)}</tbody></table>{errors.map((error,index) => <p className="formError" key={index}>Row {error.row ?? "?"}: {error.message}</p>)}{preview.length > 0 && <div className="dialogActions"><Button onClick={commitCsv} disabled={pending}>{pending ? "Importing…" : `Import ${preview.length} roles`}</Button></div>}</div>}
    </div> : <div>
      <div className="notice"><Link2 size={15} />For safety, private-network addresses, oversized pages, non-HTML content, and redirect tricks are blocked. Some job sites block automated access; manual paste remains available.</div>
      {!urlPreview ? <form action={previewUrl}><div className="field"><label htmlFor="job-url">Public job listing URL</label><input id="job-url" name="url" type="url" placeholder="https://company.com/careers/role" required /></div><Button disabled={pending}><Globe2 size={14} />{pending ? "Reading page…" : "Fetch preview"}</Button></form> : <form action={saveUrl}><div className="formGrid"><div className="field"><label htmlFor="url-title">Job title</label><input id="url-title" name="title" defaultValue={urlPreview.title} required /></div><div className="field"><label htmlFor="url-company">Company</label><input id="url-company" name="company" defaultValue={urlPreview.company} required /></div><div className="field fieldFull"><label htmlFor="url-description">Preserved description</label><textarea id="url-description" name="description" defaultValue={urlPreview.description} required /></div></div><div className="dialogActions"><Button type="button" variant="ghost" onClick={() => setUrlPreview(null)}>Start over</Button><Button disabled={pending}>{pending ? "Saving…" : "Save to pipeline"}</Button></div></form>}
    </div>}
  </div></section>;
}
