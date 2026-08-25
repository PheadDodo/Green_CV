import { AutomationSettings } from "@/components/automation-settings";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getDataRepository } from "@/lib/data";

export const metadata = { title: "Automation" };

export default async function AutomationPage() {
  const user = await requireUser();
  const repository = await getDataRepository({ userId: user.id });
  const [rules, runs] = await Promise.all([repository.listAutomationRules(), repository.listAutomationRuns({ limit: 30 })]);
  return <main className="page"><PageHeader eyebrow="Controlled assistance" title="Automation" description="Let repeatable rules handle evaluation and reminders while every run remains visible and cancellable." /><AutomationSettings initialRules={rules} initialRuns={runs} /></main>;
}
