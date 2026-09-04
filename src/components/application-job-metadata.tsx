import type { Job } from "@/lib/data/types";

type JobMetadata = Pick<
  Job,
  | "workplaceType"
  | "employmentType"
  | "source"
  | "salaryMin"
  | "salaryMax"
  | "salaryCurrency"
  | "publishedAt"
>;

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function formatSalary(job: JobMetadata): string | null {
  const hasMinimum = job.salaryMin !== null;
  const hasMaximum = job.salaryMax !== null;
  if (!hasMinimum && !hasMaximum) return null;

  const currency = job.salaryCurrency ? `${job.salaryCurrency.toUpperCase()} ` : "";
  if (hasMinimum && hasMaximum) {
    return `${currency}${numberFormatter.format(job.salaryMin!)}–${numberFormatter.format(job.salaryMax!)}`;
  }
  if (hasMinimum) return `${currency}${numberFormatter.format(job.salaryMin!)}+`;
  return `Up to ${currency}${numberFormatter.format(job.salaryMax!)}`;
}

function formatPublishedDate(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? dateFormatter.format(timestamp) : value;
}

export function ApplicationJobMetadata({ job }: { job: JobMetadata }) {
  const salary = formatSalary(job);

  return <div className="factsGrid">
    <div className="fact"><span>Workplace</span><b>{job.workplaceType}</b></div>
    <div className="fact"><span>Employment</span><b>{job.employmentType.replace("_", "-")}</b></div>
    <div className="fact"><span>Source</span><b>{job.source}</b></div>
    {salary && <div className="fact"><span>Salary</span><b>{salary}</b></div>}
    {job.publishedAt && <div className="fact"><span>Published</span><b>{formatPublishedDate(job.publishedAt)}</b></div>}
  </div>;
}
