import { Archive, SlidersHorizontal } from "lucide-react";
import { AddRoleDialog } from "@/components/add-role-dialog";
import { PipelineBoard } from "@/components/pipeline-board";
import { Badge, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getDataRepository } from "@/lib/data";

export const metadata = { title: "Applications" };

export default async function ApplicationsPage() {
  const user = await requireUser();
  const repository = await getDataRepository({ userId: user.id });
  const [applications, cvs] = await Promise.all([repository.listApplications(), repository.listCvVersions()]);
  const archived = applications.filter(item => ["rejected", "withdrawn", "archived"].includes(item.status));
  return <main className="page">
    <PageHeader eyebrow="Your search, at a glance" title="Application pipeline" description="Move from curiosity to offer with every stage change recorded." actions={<><button className="button button-ghost"><SlidersHorizontal size={15} /> All roles</button><AddRoleDialog cvs={cvs} label="New role" /></>} />
    <div className="pipelineSummary"><Badge tone="green">{applications.filter(item => ["applied","screening","interview"].includes(item.status)).length} active</Badge><Badge tone="amber">{applications.filter(item => item.status === "interview").length} interviewing</Badge><Badge>{applications.length} total</Badge></div>
    <PipelineBoard applications={applications} />
    {archived.length > 0 && <details className="panel" style={{ marginTop: 15 }}><summary className="panelHeader" style={{ cursor: "pointer" }}><div><h2><Archive size={14} style={{ marginRight: 7, verticalAlign: "middle" }} />Closed applications</h2><p>Rejected, withdrawn, and archived records remain available for honest metrics.</p></div><Badge>{archived.length}</Badge></summary></details>}
  </main>;
}
