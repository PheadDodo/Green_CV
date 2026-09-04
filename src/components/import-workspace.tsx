"use client";

import { FileSpreadsheet, Globe2, Import, Link2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import type { JobCreateInput } from "@/lib/data/types";
import { Badge, Button } from "./ui";

type Tab = "csv" | "url";

interface UrlPreview {
  title: string;
  company: string;
  description: string;
  sourceUrl: string;
}

interface CsvPreviewError {
  row: number;
  message: string;
  value?: string;
}

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  try {
    return await response.json() as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function ImportWorkspace() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("csv");
  const [preview, setPreview] = useState<JobCreateInput[]>([]);
  const selectedCsvFile = useRef<File | null>(null);
  const csvFileName = useRef<string | null>(null);
  const csvTotalRows = useRef<number | null>(null);
  const csvJobRows = useRef<number[]>([]);
  const [errors, setErrors] = useState<CsvPreviewError[]>([]);
  const [urlPreview, setUrlPreview] = useState<UrlPreview | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function previewCsv(formData: FormData) {
    const file = selectedCsvFile.current ?? formData.get("file");
    if (!(file instanceof File)) return;
    const fileName = file.name;
    setPending(true);
    setMessage("");
    setPreview([]);
    setErrors([]);
    csvFileName.current = null;
    csvTotalRows.current = null;
    csvJobRows.current = [];
    try {
      const csv = await file.text();
      const response = await fetch("/api/imports/csv", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csv, fileName, commit: false }),
      });
      const body = await responseBody(response);
      if (!response.ok) {
        setMessage(typeof body.error === "string" ? body.error : "Could not parse this CSV.");
        return;
      }
      const jobs = Array.isArray(body.jobs) ? body.jobs as JobCreateInput[] : [];
      const previewErrors = Array.isArray(body.errors)
        ? body.errors.filter((error): error is CsvPreviewError => {
          if (!error || typeof error !== "object") return false;
          const candidate = error as Record<string, unknown>;
          return Number.isSafeInteger(candidate.row) && typeof candidate.message === "string";
        })
        : [];
      const totalRows = typeof body.totalRows === "number" && Number.isSafeInteger(body.totalRows)
        ? body.totalRows
        : null;
      const jobRows = Array.isArray(body.jobRows)
        ? body.jobRows.filter((row): row is number => Number.isSafeInteger(row))
        : [];
      if (totalRows === null || jobRows.length !== jobs.length) {
        setMessage("Could not parse this CSV.");
        return;
      }
      setPreview(jobs);
      setErrors(previewErrors);
      csvFileName.current = fileName;
      csvTotalRows.current = totalRows;
      csvJobRows.current = jobRows;
    } catch {
      setMessage("Could not parse this CSV.");
    } finally {
      setPending(false);
    }
  }

  async function commitCsv() {
    if (
      !csvFileName.current ||
      csvTotalRows.current === null ||
      csvJobRows.current.length !== preview.length ||
      preview.length === 0
    ) return;
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/imports/csv", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jobs: preview,
          jobRows: csvJobRows.current,
          previewErrors: errors,
          totalRows: csvTotalRows.current,
          fileName: csvFileName.current,
          commit: true,
        }),
      });
      const body = await responseBody(response);
      if (!response.ok) {
        setMessage(typeof body.error === "string" ? body.error : "Import failed.");
        return;
      }
      const applications = Array.isArray(body.applications) ? body.applications : [];
      const importErrors = Array.isArray(body.errors) ? body.errors : [];
      const failedRows = typeof body.failedRows === "number" && Number.isSafeInteger(body.failedRows)
        ? body.failedRows
        : new Set(importErrors.flatMap((error) => {
          if (!error || typeof error !== "object") return [];
          const row = (error as Record<string, unknown>).row;
          return typeof row === "number" ? [row] : [];
        })).size;
      setMessage(`Imported ${applications.length} roles${failedRows ? `; ${failedRows} rows failed` : ""}.`);
      setPreview([]);
      setErrors([]);
      csvFileName.current = null;
      csvTotalRows.current = null;
      csvJobRows.current = [];
      selectedCsvFile.current = null;
      router.refresh();
    } catch {
      setMessage("Import failed.");
    } finally {
      setPending(false);
    }
  }

  async function previewUrl(formData: FormData) {
    setPending(true);
    setMessage("");
    setUrlPreview(null);
    try {
      const response = await fetch("/api/imports/url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: formData.get("url"), commit: false }),
      });
      const body = await responseBody(response);
      if (!response.ok) {
        setMessage(typeof body.error === "string"
          ? body.error
          : "Could not read this URL. Paste the job manually instead.");
        return;
      }
      const job = body.job as Record<string, unknown> | undefined;
      if (!job || typeof job.text !== "string" || typeof job.finalUrl !== "string") {
        setMessage("Could not read this URL. Paste the job manually instead.");
        return;
      }
      setUrlPreview({
        title: typeof job.title === "string" ? job.title : "",
        company: typeof job.company === "string" ? job.company : "",
        description: job.text,
        sourceUrl: job.finalUrl,
      });
    } catch {
      setMessage("Could not read this URL. Paste the job manually instead.");
    } finally {
      setPending(false);
    }
  }

  async function saveUrl(formData: FormData) {
    if (!urlPreview) return;
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/imports/url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...Object.fromEntries(formData.entries()),
          sourceUrl: urlPreview.sourceUrl,
          commit: true,
        }),
      });
      const body = await responseBody(response);
      if (!response.ok) {
        setMessage(typeof body.error === "string" ? body.error : "Could not save the imported job.");
        return;
      }
      const application = body.application as { id?: unknown } | undefined;
      if (!application || typeof application.id !== "string") {
        setMessage("Could not save the imported job.");
        return;
      }
      router.push(`/applications/${application.id}`);
      router.refresh();
    } catch {
      setMessage("Could not save the imported job.");
    } finally {
      setPending(false);
    }
  }

  return <section className="panel">
    <div className="panelHeader"><div>
      <h2>Bring in existing opportunities</h2>
      <p>Every import is previewed and validated before it changes your pipeline.</p>
    </div></div>
    <div className="panelBody">
      <div className="tabBar">
        <button type="button" className={tab === "csv" ? "active" : ""} onClick={() => {
          setTab("csv");
          setMessage("");
        }}><FileSpreadsheet size={13} /> CSV file</button>
        <button type="button" className={tab === "url" ? "active" : ""} onClick={() => {
          setTab("url");
          setMessage("");
        }}><Globe2 size={13} /> Job URL</button>
      </div>

      {message && <div
        className={message.startsWith("Imported") ? "notice" : "formError"}
        role={message.startsWith("Imported") ? "status" : "alert"}
      >{message}</div>}

      {tab === "csv" ? <div>
        <form action={previewCsv}>
          <div className="dropzone"><div>
            <FileSpreadsheet size={28} />
            <h3>Upload a jobs CSV</h3>
            <p>Required columns: title, company, and description. Optional location, URL, employment type, and salary columns are recognized.</p>
            <label htmlFor="jobs-csv">Jobs CSV file</label>
            <input
              id="jobs-csv"
              type="file"
              name="file"
              accept=".csv,text/csv"
              required
              onChange={(event) => {
                selectedCsvFile.current = event.currentTarget.files?.[0] ?? null;
              }}
            />
          </div></div>
          <div className="dialogActions" style={{ marginTop: 12 }}>
            <a className="button button-ghost" href="/sample-jobs.csv" download>Download template</a>
            <Button disabled={pending}><Import size={14} />{pending ? "Validating…" : "Preview rows"}</Button>
          </div>
        </form>

        {(preview.length > 0 || errors.length > 0) && <div style={{ overflowX: "auto", marginTop: 20 }}>
          <div className="pipelineSummary">
            <Badge tone="green">{preview.length} valid</Badge>
            <Badge tone={errors.length ? "red" : "neutral"}>{errors.length} errors</Badge>
          </div>
          <table className="previewTable">
            <thead><tr><th>Company</th><th>Role</th><th>Location</th><th>Description</th></tr></thead>
            <tbody>{preview.map((job, index) => <tr key={`${job.company}-${job.title}-${index}`}>
              <td>{job.company}</td><td>{job.title}</td><td>{job.location || "—"}</td>
              <td>{job.description.slice(0, 100)}…</td>
            </tr>)}</tbody>
          </table>
          {errors.map((error, index) => <p className="formError" key={index}>
            Row {error.row ?? "?"}: {error.message}
          </p>)}
          {preview.length > 0 && <div className="dialogActions">
            <Button type="button" onClick={() => void commitCsv()} disabled={pending}>
              {pending ? "Importing…" : `Import ${preview.length} roles`}
            </Button>
          </div>}
        </div>}
      </div> : <div>
        <div className="notice"><Link2 size={15} />For safety, private-network addresses, oversized pages, non-HTML content, and redirect tricks are blocked. Some job sites block automated access; manual paste remains available.</div>
        {!urlPreview ? <form action={previewUrl}>
          <div className="field">
            <label htmlFor="job-url">Public job listing URL</label>
            <input id="job-url" name="url" type="url" placeholder="https://company.com/careers/role" required />
          </div>
          <Button disabled={pending}><Globe2 size={14} />{pending ? "Reading page…" : "Fetch preview"}</Button>
        </form> : <form action={saveUrl}>
          <div className="formGrid">
            <div className="field"><label htmlFor="url-title">Job title</label><input id="url-title" name="title" defaultValue={urlPreview.title} required /></div>
            <div className="field"><label htmlFor="url-company">Company</label><input id="url-company" name="company" defaultValue={urlPreview.company} required /></div>
            <div className="field"><label htmlFor="url-location">Location</label><input id="url-location" name="location" /></div>
            <div className="field"><label htmlFor="url-workplace-type">Workplace type</label><select id="url-workplace-type" name="workplaceType" defaultValue="unspecified">
              <option value="unspecified">Unspecified</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="onsite">On-site</option>
            </select></div>
            <div className="field"><label htmlFor="url-employment-type">Employment type</label><select id="url-employment-type" name="employmentType" defaultValue="unspecified">
              <option value="unspecified">Unspecified</option><option value="full_time">Full-time</option><option value="part_time">Part-time</option><option value="contract">Contract</option><option value="internship">Internship</option><option value="temporary">Temporary</option>
            </select></div>
            <div className="field fieldFull"><label htmlFor="url-description">Preserved description</label><textarea id="url-description" name="description" defaultValue={urlPreview.description} required /></div>
          </div>
          <div className="dialogActions">
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setUrlPreview(null)}>Start over</Button>
            <Button disabled={pending}>{pending ? "Saving…" : "Save to pipeline"}</Button>
          </div>
        </form>}
      </div>}
    </div>
  </section>;
}
