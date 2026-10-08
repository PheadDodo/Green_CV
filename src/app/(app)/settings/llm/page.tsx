import { LlmSettingsForm } from "@/components/llm-settings";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getDataRepository } from "@/lib/data";
import { getPublicLlmSettings } from "@/lib/llm/settings";

export const metadata = { title: "LLM settings" };
export const dynamic = "force-dynamic";

export default async function LlmSettingsPage() {
  const user = await requireUser();
  const repository = await getDataRepository({ userId: user.id });
  const settings = await getPublicLlmSettings(repository);
  return (
    <main className="page">
      <PageHeader eyebrow="Your choice of model" title="LLM settings" description="Choose an API provider or a local model for your CV fit evaluations." />
      <LlmSettingsForm
        initialSettings={settings}
        localAvailable={process.env.NODE_ENV !== "production"}
        defaultDescription={process.env.OPENAI_API_KEY ? "Server-configured OpenAI model" : "Deterministic demo evaluator"}
      />
    </main>
  );
}
