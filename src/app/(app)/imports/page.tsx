import { Badge, PageHeader } from "@/components/ui";
import { ImportWorkspace } from "@/components/import-workspace";
import { requireUser } from "@/lib/auth";
import { getDataRepository } from "@/lib/data";

export const metadata = { title: "Imports" };

export default async function ImportsPage() {
  const user = await requireUser();
  const repository = await getDataRepository({ userId: user.id });
  const batches = await repository.listImportBatches();
  return <main className="page"><PageHeader eyebrow="Bring your history" title="Imports" description="Add existing job-search data without losing source descriptions or provenance." /><div className="splitGrid"><ImportWorkspace /><aside className="panel"><div className="panelHeader"><div><h2>Import history</h2><p>Auditable batches and row-level failures.</p></div><Badge>{batches.length}</Badge></div><div className="panelBody runList">{batches.map(batch => <div className="runItem" key={batch.id}><span className="timelineDot">✓</span><div><b>{batch.fileName || `${batch.source} import`}</b><span>{batch.succeededRows}/{batch.totalRows} imported · {new Date(batch.createdAt).toLocaleString()}</span></div><Badge tone={batch.status === "completed" ? "green" : batch.status === "failed" ? "red" : "amber"}>{batch.status}</Badge></div>)}{!batches.length && <p className="notice">No imports yet. Manual roles are not included here.</p>}</div></aside></div></main>;
}
