import { ImportHistory } from "@/components/import-history";
import { ImportWorkspace } from "@/components/import-workspace";
import { Badge, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getDataRepository } from "@/lib/data";

export const metadata = { title: "Imports" };

export default async function ImportsPage() {
  const user = await requireUser();
  const repository = await getDataRepository({ userId: user.id });
  const batches = await repository.listImportBatches();

  return <main className="page">
    <PageHeader
      eyebrow="Bring your history"
      title="Imports"
      description="Add existing job-search data without losing source descriptions or provenance."
    />
    <div className="splitGrid">
      <ImportWorkspace />
      <aside className="panel">
        <div className="panelHeader">
          <div><h2>Import history</h2><p>Auditable batches and row-level failures.</p></div>
          <Badge>{batches.length}</Badge>
        </div>
        <ImportHistory batches={batches} />
      </aside>
    </div>
  </main>;
}
