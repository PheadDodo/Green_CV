import { Badge } from "./ui";
import type { JobBrief } from "@/lib/job-brief";

const sections: Array<{ key: keyof Omit<JobBrief, "keywords">; title: string }> = [
  { key: "overview", title: "Role overview" },
  { key: "responsibilities", title: "Responsibilities" },
  { key: "mustHaves", title: "Must-haves" },
  { key: "niceToHaves", title: "Nice-to-haves" },
  { key: "logistics", title: "Logistics & compensation" },
];

export function RoleSummary({ brief }: { brief: JobBrief }) {
  const visibleSections = sections.filter(({ key }) => brief[key].length > 0);

  if (!visibleSections.length && !brief.keywords.length) {
    return <p className="notice">This posting is too short to extract a reliable brief. The preserved description remains available below.</p>;
  }

  return (
    <div>
      <div className="evidenceGrid" style={{ marginTop: 0 }}>
        {visibleSections.map(({ key, title }) => (
          <section key={key}>
            <h3 className="sectionTitle">{title}</h3>
            <ul style={{ margin: 0, paddingLeft: 18, color: "#46514d", fontSize: 11, lineHeight: 1.65 }}>
              {brief[key].map((item) => <li key={item} style={{ marginBottom: 7 }}>{item}</li>)}
            </ul>
          </section>
        ))}
      </div>
      {brief.keywords.length > 0 && <div style={{ marginTop: 18 }}><h3 className="sectionTitle">Keywords in this posting</h3><div className="pipelineSummary" style={{ marginBottom: 0 }}>{brief.keywords.map((keyword) => <Badge tone="blue" key={keyword}>{keyword}</Badge>)}</div></div>}
    </div>
  );
}
