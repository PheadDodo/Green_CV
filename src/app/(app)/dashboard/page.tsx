import Link from "next/link";
import { ArrowUpRight, BriefcaseBusiness, CalendarCheck2, MessageCircleReply, Sparkles, Target } from "lucide-react";
import { AddRoleDialog } from "@/components/add-role-dialog";
import { FunnelChart } from "@/components/funnel-chart";
import { Badge, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getDataRepository } from "@/lib/data";
import { calculateDashboardMetrics } from "@/lib/metrics";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  const repository = await getDataRepository({ userId: user.id });
  const [applications, cvs, reminders] = await Promise.all([repository.listApplications(), repository.listCvVersions(), repository.listReminders()]);
  const metrics = calculateDashboardMetrics(applications.map(application => ({
    id: application.id,
    status: application.status,
    discoveredAt: application.job.createdAt,
    appliedAt: application.appliedAt,
    latestEvaluationScore: application.latestEvaluation?.overallScore,
    events: application.events.map(event => ({ eventType: event.type, occurredAt: event.occurredAt, toStatus: event.toStatus }))
  })));
  const featured = applications.filter(application => application.latestEvaluation?.overallScore != null && !["rejected", "withdrawn", "archived"].includes(application.status)).sort((a,b) => (b.latestEvaluation?.overallScore ?? 0) - (a.latestEvaluation?.overallScore ?? 0))[0];
  const activity = applications.flatMap(application => application.events.map(event => ({ application, event }))).sort((a,b) => b.event.occurredAt.localeCompare(a.event.occurredAt)).slice(0,4);

  return <main className="page">
    <PageHeader eyebrow="Overview" title={`Good ${greeting()}, ${user.displayName?.split(" ")[0] ?? "there"}.`} description="Your live application data, distilled into the next useful move." actions={<><Link href="/imports" className="button button-ghost">Import roles</Link><AddRoleDialog cvs={cvs} /></>} />
    <section className="metricGrid">
      <Metric label="Active applications" value={metrics.activeApplications} foot="Applied, screening, or interview" icon={<BriefcaseBusiness size={15} />} />
      <Metric label="Response rate" value={`${metrics.responseRate}%`} foot="Human replies in this cohort" icon={<MessageCircleReply size={15} />} />
      <Metric label="Interviews" value={metrics.interviews} foot="Reached during the last 30 days" icon={<CalendarCheck2 size={15} />} />
      <Metric label="Average fit" value={metrics.averageFit || "—"} foot="Latest score for active roles" icon={<Target size={15} />} />
    </section>
    <div className="dashboardGrid">
      <section>
        <article className="panel"><div className="panelHeader"><div><h2>Application funnel</h2><p>Distinct applications reaching each stage in the last 30 days</p></div><Badge tone="green">Live data</Badge></div><div className="panelBody"><FunnelChart data={metrics.funnel} /></div></article>
        <article className="panel activityPanel"><div className="panelHeader"><div><h2>Recent activity</h2><p>Your append-only job-search timeline</p></div><Link className="button button-ghost" href="/applications">View pipeline</Link></div><div className="activityList">
          {activity.map(({ application, event }) => <div className="activityItem" key={event.id}><span className="companyLogo">{application.job.company.slice(0,1)}</span><div><b>{event.title}</b><span>{application.job.company} · {application.job.title}</span></div><Badge tone={event.toStatus === "interview" ? "green" : "neutral"}>{relativeDate(event.occurredAt)}</Badge></div>)}
          {!activity.length && <p className="notice">Add your first role to start the timeline.</p>}
        </div></article>
      </section>
      <aside>
        {featured ? <article className="panel nextMove"><div className="panelHeader"><div><span className="eyebrow" style={{ color: "#f4c653" }}>Best next move</span><h2>High-fit opportunity</h2><p>Latest evidence-backed recommendation</p></div><Sparkles size={18} /></div><div className="panelBody featuredRole"><div className="fitScore" style={{ "--score": featured.latestEvaluation?.overallScore ?? 0 } as React.CSSProperties}><span>{featured.latestEvaluation?.overallScore}</span></div><h3>{featured.job.title}</h3><p>{featured.job.company} · {featured.job.location || featured.job.workplaceType}</p><div className="skillPills">{featured.latestEvaluation?.strengths.slice(0,3).map(value => <span key={value}>{value.length > 24 ? `${value.slice(0,24)}…` : value}</span>)}</div><Link className="button button-secondary" href={`/applications/${featured.id}/evaluation`}>Open evaluation <ArrowUpRight size={14} /></Link></div></article> : <article className="panel"><div className="panelHeader"><div><h2>Your next move</h2><p>Evaluate a role to surface it here.</p></div></div></article>}
        <article className="panel" style={{ marginTop: 15 }}><div className="panelHeader"><div><h2>Upcoming reminders</h2><p>Generated from your activity and rules</p></div><Badge tone="amber">{reminders.length}</Badge></div><div className="panelBody reminderList">{reminders.slice(0,3).map(reminder => <div className="reminderItem" key={reminder.id}><span className="timelineDot">✓</span><div><b>{reminder.title}</b><span>{new Date(reminder.dueAt).toLocaleString("en", { month: "short", day: "numeric", hour: "numeric" })}</span></div></div>)}</div></article>
      </aside>
    </div>
  </main>;
}

function Metric({ label, value, foot, icon }: { label: string; value: string | number; foot: string; icon: React.ReactNode }) { return <article className="metricCard"><div className="metricTop"><span>{label}</span><span className="metricIcon">{icon}</span></div><strong className="metricValue">{value}</strong><span className="metricFoot">{foot}</span></article>; }
function greeting() { const hour = new Date().getHours(); return hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"; }
function relativeDate(value: string) { const days = Math.floor((Date.now() - new Date(value).getTime()) / 86400000); return days <= 0 ? "Today" : days === 1 ? "Yesterday" : `${days}d ago`; }
