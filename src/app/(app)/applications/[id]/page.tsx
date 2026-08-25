import Link from "next/link";
import { ArrowLeft, Check, Clock3, ExternalLink, Sparkles } from "lucide-react";
import { notFound } from "next/navigation";
import { JobWorkflow } from "@/components/job-workflow";
import { ActivityRecorder } from "@/components/activity-recorder";
import { RoleSummary } from "@/components/role-summary";
import { Badge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getDataRepository } from "@/lib/data";
import { summarizeJobDescription } from "@/lib/job-brief";

export default async function ApplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const repository = await getDataRepository({ userId: user.id });
  const [application, cvs] = await Promise.all([repository.getApplication(id), repository.listCvVersions()]);
  if (!application) notFound();
  const roleBrief = summarizeJobDescription(application.job.description);
  return <main className="page">
    <Link href="/applications" className="button button-ghost" style={{ marginBottom: 18 }}><ArrowLeft size={14} /> Pipeline</Link>
    <section className="panel"><div className="panelBody" style={{ paddingTop: 27 }}><div className="detailTop"><div><Badge tone={application.status === "interview" ? "green" : "blue"}>{application.status}</Badge><h1>{application.job.title}</h1><p>{application.job.company} · {application.job.location || application.job.workplaceType}</p></div>{application.latestEvaluation?.overallScore != null && <div className="detailScore"><strong>{application.latestEvaluation.overallScore}</strong><span>Evidence fit / 100</span></div>}</div>
      <div className="factsGrid"><div className="fact"><span>Workplace</span><b>{application.job.workplaceType}</b></div><div className="fact"><span>Employment</span><b>{application.job.employmentType.replace("_", "-")}</b></div><div className="fact"><span>Source</span><b>{application.job.source}</b></div></div>
      <section style={{ marginTop: 22 }}><div className="panelHeader" style={{ paddingInline: 0 }}><div><h2>Job brief</h2><p>Extracted directly from the preserved posting; no details are invented.</p></div><Badge tone="green">Evidence only</Badge></div><RoleSummary brief={roleBrief} /></section>
      <div className="detailGrid"><section><h2 className="sectionTitle">Preserved job description</h2><div className="descriptionText">{application.job.description}</div>{application.job.sourceUrl && <a className="button button-ghost" href={application.job.sourceUrl} target="_blank" rel="noreferrer" style={{ marginTop: 13 }}>Original listing <ExternalLink size={13} /></a>}</section><aside><h2 className="sectionTitle">Next step</h2><JobWorkflow applicationId={application.id} currentCvId={application.cvVersionId} cvs={cvs} hasEvaluation={Boolean(application.latestEvaluation)} /><ActivityRecorder applicationId={application.id} /></aside></div>
    </div></section>
    <div className="detailGrid"><section className="panel"><div className="panelHeader"><div><h2>Application timeline</h2><p>Every meaningful change is retained.</p></div></div><div className="panelBody timeline">{application.events.map(event => <div className="timelineItem" key={event.id}><span className="timelineDot"><Check size={10} /></span><div><b>{event.title}</b>{event.details && <p>{event.details}</p>}<time>{new Date(event.occurredAt).toLocaleString()}</time></div></div>)}</div></section><aside className="panel"><div className="panelHeader"><div><h2>Evaluation</h2><p>Compare this role with the attached CV.</p></div><Sparkles size={17} /></div><div className="panelBody">{application.latestEvaluation ? <><Badge tone="green">{application.latestEvaluation.recommendation}</Badge><p style={{ fontSize: 11, lineHeight: 1.6, marginTop: 12 }}>{application.latestEvaluation.summary}</p><Link className="button button-secondary" href={`/applications/${application.id}/evaluation`}>Open full evaluation</Link></> : <div className="notice"><Clock3 size={15} />Attach a CV and run the first evaluation.</div>}</div></aside></div>
  </main>;
}
