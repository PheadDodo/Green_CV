"use client";

import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { CvVersion } from "@/lib/data/types";
import { Button } from "./ui";

type CvChoice = Pick<CvVersion, "id" | "name" | "isDefault">;

export function AddRoleDialog({ cvs = [], label = "Add role" }: { cvs?: CvChoice[]; label?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    addEventListener("keydown", close);
    return () => removeEventListener("keydown", close);
  }, []);

  async function submit(formData: FormData) {
    setError("");
    const payload = Object.fromEntries(formData.entries());
    const response = await fetch("/api/applications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error ?? "Could not save this role.");
      return;
    }
    setOpen(false);
    startTransition(() => {
      router.push(`/applications/${body.application.id}`);
      router.refresh();
    });
  }

  return <>
    <Button onClick={() => setOpen(true)}><Plus size={16} />{label}</Button>
    {open && <div className="dialogBackdrop" role="presentation" onMouseDown={event => event.currentTarget === event.target && setOpen(false)}>
      <form className="dialog" action={submit} aria-label="Add a job application">
        <div className="dialogHeader"><div><span className="eyebrow">New opportunity</span><h2>Add a role to your pipeline</h2><p>The full description is preserved even if the listing disappears.</p></div><button type="button" className="iconButton" onClick={() => setOpen(false)} aria-label="Close dialog"><X size={17} /></button></div>
        {error && <p className="formError" role="alert">{error}</p>}
        <div className="formGrid">
          <div className="field"><label htmlFor="title">Job title</label><input id="title" name="title" required minLength={2} placeholder="Machine Learning Engineer" /></div>
          <div className="field"><label htmlFor="company">Company</label><input id="company" name="company" required minLength={2} placeholder="Northstar AI" /></div>
          <div className="field"><label htmlFor="location">Location</label><input id="location" name="location" placeholder="Remote, Europe" /></div>
          <div className="field"><label htmlFor="sourceUrl">Source URL</label><input id="sourceUrl" name="sourceUrl" type="url" placeholder="https://…" /></div>
          <div className="field"><label htmlFor="workplaceType">Workplace</label><select id="workplaceType" name="workplaceType" defaultValue="unspecified"><option value="unspecified">Unspecified</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="onsite">On-site</option></select></div>
          <div className="field"><label htmlFor="employmentType">Employment</label><select id="employmentType" name="employmentType" defaultValue="full_time"><option value="full_time">Full-time</option><option value="part_time">Part-time</option><option value="contract">Contract</option><option value="internship">Internship</option></select></div>
          <div className="field fieldFull"><label htmlFor="description">Job description snapshot</label><textarea id="description" name="description" required minLength={20} placeholder="Paste the complete job description…" /><small>This snapshot becomes the authoritative source for future evaluations.</small></div>
          <div className="field"><label htmlFor="status">Starting status</label><select id="status" name="status" defaultValue="saved"><option value="saved">Saved</option><option value="applied">Applied</option><option value="screening">Screening</option></select></div>
          <div className="field"><label htmlFor="cvVersionId">Attach CV version</label><select id="cvVersionId" name="cvVersionId" defaultValue={cvs.find(cv => cv.isDefault)?.id ?? ""}><option value="">Attach later</option>{cvs.map(cv => <option key={cv.id} value={cv.id}>{cv.name}</option>)}</select></div>
        </div>
        <div className="dialogActions"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? "Opening…" : "Save role"}</Button></div>
      </form>
    </div>}
  </>;
}
