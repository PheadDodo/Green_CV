import { AddRoleDialog } from "@/components/add-role-dialog";
import { PipelineBoard } from "@/components/pipeline-board";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getDataRepository } from "@/lib/data";

export const metadata = { title: "Applications" };

export default async function ApplicationsPage() {
  const user = await requireUser();
  const repository = await getDataRepository({ userId: user.id });
  const [applications, cvs] = await Promise.all([repository.listApplications(), repository.listCvVersions()]);
  return <main className="page">
    <PageHeader eyebrow="Your search, at a glance" title="Application pipeline" description="Move from curiosity to offer with every stage change recorded." actions={<AddRoleDialog cvs={cvs} label="New role" />} />
    <PipelineBoard applications={applications} />
  </main>;
}
