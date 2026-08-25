import Link from "next/link";
import { AlertCircle, ArrowLeft, Check, FileText, Sparkles } from "lucide-react";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getDataRepository } from "@/lib/data";

export default async function EvaluationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ version?: string }> }) {
  const [{ id }, query, user] = await Promise.all([params, searchParams, requireUser()]);
  const repository = await getDataRepository({ userId: user.id });
  const application = await repository.getApplication(id);
  if (!application) notFound();
  const evaluations = (await repository.listEvaluations(application.jobId)).filter(item => item.applicationId === application.id).sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  const selected = evaluations.find(item => item.id === query.version) ?? evaluations[0];
  if (!selected) return <main className="page"><Link href={`/applications/${id}`} className="button button-ghost"><ArrowLeft size={14} /> Role</Link><section className="emptyState"><Sparkles /><h2>No evaluation yet</h2><p>Attach a CV from the role page and run an evidence analysis first.</p></section></main>;
  const tone = selected.recommendation === "apply" ? "green" : selected.recommendation === "consider" ? "amber" : "red";
  return <main className="page">
    <Link href={`/applications/${id}`} className="button button-ghost" style={{ marginBottom: 18 }}><ArrowLeft size={14} /> Role detail</Link>
    <section className="panel evaluationHero"><div className="panelBody" style={{ paddingTop: 28 }}>
      <div className="detailTop"><div><Badge tone={tone}>{selected.recommendation ?? selected.status}</Badge><h1>{application.job.title}</h1><p>{application.job.company} · Compared with {application.cvVersion?.name ?? "unavailable CV"}</p></div><div className="detailScore"><strong>{selected.overallScore ?? "—"}</strong><span>Evidence fit / 100</span></div></div>
      <div className="factsGrid"><div className="fact"><span>Recommendation</span><b>{selected.recommendation ?? "Pending"}</b></div><div className="fact"><span>Evaluator</span><b>{selected.model ?? "—"}</b></div><div className="fact"><span>Version</span><b>Prompt {selected.promptVersion ?? "—"}</b></div></div>
      <p style={{ fontSize: 12, lineHeight: 1.7, maxWidth: 850 }}>{selected.summary}</p>
      <div className="evidenceGrid"><section><h2 className="sectionTitle">Evidence-backed matches</h2>{selected.evidence.length ? selected.evidence.map((item,index) => <div className="evidenceItem" key={`${item.requirement}-${index}`}><span className="evidenceIcon"><Check size={10} /></span><span><b>{item.requirement}</b><br /><span style={{ color: "#697471" }}>“{item.cvEvidence}”</span></span></div>) : selected.strengths.map(value => <div className="evidenceItem" key={value}><span className="evidenceIcon"><Check size={10} /></span><span>{value}</span></div>)}</section><section><h2 className="sectionTitle">Honest gaps</h2>{selected.gaps.map(value => <div className="evidenceItem" key={value}><span className="evidenceIcon gap"><AlertCircle size={10} /></span><span>{value}</span></div>)}</section></div>
    </div></section>
    <div className="detailGrid"><section className="panel"><div className="panelHeader"><div><h2>Evidence-backed CV edits</h2><p>Emphasize what exists; never invent experience.</p></div><FileText size={17} /></div><div className="panelBody suggestionList">{selected.suggestedEdits.map((value,index) => <div className="suggestion" key={value}><span>{index + 1}</span><span>{value}</span></div>)}{!selected.suggestedEdits.length && <p className="notice">No safe edits were generated for this version.</p>}</div></section>
      <aside className="panel"><div className="panelHeader"><div><h2>Evaluation history</h2><p>Results are versioned instead of overwritten.</p></div><Badge>{evaluations.length}</Badge></div><div className="panelBody evaluationHistory">{evaluations.map((evaluation,index) => <Link href={`/applications/${id}/evaluation?version=${evaluation.id}`} className="historyItem" key={evaluation.id} style={{ textDecoration: "none", borderColor: evaluation.id === selected.id ? "#145b45" : undefined }}><div><b>Evaluation #{evaluations.length - index}</b><span>{new Date(evaluation.createdAt).toLocaleString()} · {evaluation.model}</span></div><Badge tone={evaluation.status === "completed" ? "green" : evaluation.status === "failed" ? "red" : "amber"}>{evaluation.overallScore ?? evaluation.status}</Badge></Link>)}</div></aside>
    </div>
  </main>;
}
