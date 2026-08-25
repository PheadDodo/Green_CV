import { FileCheck2, FileText } from "lucide-react";
import { CvUploader, ManualCvForm } from "@/components/cv-manager";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getDataRepository } from "@/lib/data";

export const metadata = { title: "CV library" };

export default async function CvsPage() {
  const user = await requireUser();
  const repository = await getDataRepository({ userId: user.id });
  const cvs = await repository.listCvVersions();
  return <main className="page"><PageHeader eyebrow="Versioned evidence" title="CV library" description="Keep every submitted CV immutable so evaluation history remains trustworthy." actions={<CvUploader />} /><div className="splitGrid"><section className="panel"><div className="panelHeader"><div><h2>Your CV versions</h2><p>The submitted version remains attached to each application.</p></div><Badge tone="green">{cvs.length} versions</Badge></div><div className="panelBody cvList">{cvs.map(cv => <article className="cvCard" key={cv.id}><span className="fileIcon"><FileText size={18} /></span><div><b>{cv.name}</b><span>{cv.fileName || "Pasted text"} · {cv.content.length.toLocaleString()} characters</span></div>{cv.isDefault ? <Badge tone="green"><FileCheck2 size={10} /> Default</Badge> : <Badge>{new Date(cv.createdAt).toLocaleDateString()}</Badge>}</article>)}{!cvs.length && <EmptyState icon={<FileText />} title="No CVs yet" description="Import the first version to start evaluating roles." />}</div></section><aside className="panel"><div className="panelHeader"><div><h2>Paste extracted text</h2><p>Useful when a PDF has unusual formatting.</p></div></div><div className="panelBody"><ManualCvForm /></div></aside></div></main>;
}
