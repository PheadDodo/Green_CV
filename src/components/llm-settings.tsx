"use client";

import { Cloud, Monitor, Settings2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { PublicLlmSettings } from "@/lib/llm/types";
import { Badge, Button } from "./ui";

type Mode = PublicLlmSettings["mode"];
type Protocol = PublicLlmSettings["protocol"];

const endpoints: Record<Protocol, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  ollama: "http://127.0.0.1:11434",
};

export function LlmSettingsForm({ initialSettings, localAvailable, defaultDescription }: {
  initialSettings: PublicLlmSettings;
  localAvailable: boolean;
  defaultDescription: string;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(initialSettings);
  const [mode, setMode] = useState(initialSettings.mode);
  const [protocol, setProtocol] = useState(initialSettings.protocol);
  const [baseUrl, setBaseUrl] = useState(initialSettings.baseUrl);
  const [model, setModel] = useState(initialSettings.model);
  const [apiKey, setApiKey] = useState("");
  const [clearApiKey, setClearApiKey] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);

  function changed() { setDirty(true); setMessage(""); }
  function chooseMode(next: Mode) {
    setMode(next); setApiKey(""); setClearApiKey(false); changed();
    if (next === "api" && mode !== "api") {
      setProtocol("openai"); setBaseUrl(endpoints.openai); setModel("");
    } else if (next === "local" && mode !== "local") {
      setProtocol("ollama"); setBaseUrl(endpoints.ollama); setModel("");
    }
  }
  function chooseProtocol(next: Protocol) {
    setProtocol(next); setApiKey(""); setClearApiKey(false); setModel(""); changed();
    setBaseUrl(mode === "local" && next !== "ollama" ? "http://127.0.0.1:1234/v1" : endpoints[next]);
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy("save"); setMessage(""); setError(false);
    try {
      const response = await fetch("/api/settings/llm", {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, protocol, baseUrl, model, ...(apiKey ? { apiKey } : {}), clearApiKey }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Could not save LLM settings.");
      const settings = body.settings as PublicLlmSettings;
      setSaved(settings); setMode(settings.mode); setProtocol(settings.protocol);
      setBaseUrl(settings.baseUrl); setModel(settings.model); setApiKey(""); setClearApiKey(false);
      setDirty(false); setMessage("LLM settings saved. Future evaluations will use this selection.");
      router.refresh();
    } catch (failure) {
      setError(true); setMessage(failure instanceof Error ? failure.message : "Could not save LLM settings.");
    } finally { setBusy(null); }
  }
  async function testConnection() {
    setBusy("test"); setMessage(""); setError(false);
    try {
      const response = await fetch("/api/settings/llm/test", { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Could not connect to the selected provider.");
      setMessage(body.message);
    } catch (failure) {
      setError(true); setMessage(failure instanceof Error ? failure.message : "Could not connect to the selected provider.");
    } finally { setBusy(null); }
  }

  const sameKeyTarget = saved.mode === mode && saved.protocol === protocol && saved.baseUrl.replace(/\/$/, "") === baseUrl.trim().replace(/\/$/, "");
  const keyKept = saved.hasApiKey && sameKeyTarget && !clearApiKey;
  const choices = [
    { value: "api" as const, title: "LLM API", text: "OpenAI, Claude, or another compatible provider.", icon: Cloud },
    { value: "local" as const, title: "Local LLM", text: "Ollama, LM Studio, llama.cpp, or a compatible local server.", icon: Monitor },
    { value: "default" as const, title: "Server default", text: defaultDescription, icon: Settings2 },
  ];
  return (
    <div className="splitGrid">
      <section className="panel">
        <div className="panelHeader"><div><h2>Evaluation provider</h2><p>These settings belong to your workspace.</p></div><Badge tone="green">{saved.mode === "default" ? "Server default" : saved.mode === "api" ? "API" : "Local"}</Badge></div>
        <form className="panelBody llmSettingsForm" onSubmit={save}>
          <fieldset className="llmSourceChoices" disabled={busy !== null}>
            <legend>Run evaluations with</legend>
            {choices.map(({ value, title, text, icon: Icon }) => (
              <label key={value} className={`llmSourceChoice ${mode === value ? "selected" : ""}`}>
                <input type="radio" name="llm-mode" value={value} checked={mode === value} disabled={value === "local" && !localAvailable} onChange={() => chooseMode(value)} />
                <Icon size={20} /><span><b>{title}</b><small>{text}</small></span>
              </label>
            ))}
          </fieldset>
          {!localAvailable && <p className="notice">Local models are available when GreenCV runs on your own machine in development mode.</p>}
          {mode !== "default" && (
            <fieldset className="llmConfiguration" disabled={busy !== null}>
              <legend>Connection details</legend>
              <div className="field"><label htmlFor="llm-protocol">API format</label><select id="llm-protocol" value={protocol} onChange={(event) => chooseProtocol(event.target.value as Protocol)}>
                <option value="openai">OpenAI-compatible</option>
                <option value="anthropic">Claude / Anthropic</option>
                {mode === "local" && <option value="ollama">Ollama</option>}
              </select></div>
              <div className="field"><label htmlFor="llm-endpoint">Base URL</label><input id="llm-endpoint" type="url" required maxLength={2048} value={baseUrl} onChange={(event) => { setBaseUrl(event.target.value); changed(); }} placeholder={mode === "api" ? "https://provider.example/v1" : "http://127.0.0.1:1234/v1"} /><small>{protocol === "ollama" ? "Use the Ollama server address, without /api/chat." : "Include the API prefix (usually /v1), without /chat/completions or /messages."}</small></div>
              <div className="field"><label htmlFor="llm-model">Model name</label><input id="llm-model" required maxLength={200} value={model} onChange={(event) => { setModel(event.target.value); changed(); }} placeholder={mode === "local" ? "The model loaded in your local server" : "The provider’s exact model ID"} /></div>
              <div className="field"><label htmlFor="llm-key">API key {mode === "local" && "(optional)"}</label><input id="llm-key" type="password" autoComplete="new-password" maxLength={4096} required={mode === "api" && !keyKept} value={apiKey} onChange={(event) => { setApiKey(event.target.value); setClearApiKey(false); changed(); }} placeholder={keyKept ? "Saved key — leave blank to keep it" : "Enter a key for this provider"} /><small>Keys are encrypted on the server and never returned to your browser.</small></div>
              {saved.hasApiKey && mode === "local" && <label className="llmClearKey"><input type="checkbox" checked={clearApiKey} onChange={(event) => { setClearApiKey(event.target.checked); setApiKey(""); changed(); }} />Remove saved API key</label>}
            </fieldset>
          )}
          {message && <div role={error ? "alert" : "status"} className={error ? "formError" : "notice"}>{message}</div>}
          <div className="llmSettingsActions"><Button type="submit" disabled={busy !== null}>{busy === "save" ? "Saving…" : "Save settings"}</Button><Button type="button" variant="secondary" disabled={busy !== null || dirty} onClick={testConnection}>{busy === "test" ? "Connecting…" : "Test saved connection"}</Button></div>
          {dirty && <small>Save your changes before testing the connection.</small>}
        </form>
      </section>
      <aside className="panel"><div className="panelHeader"><div><h2>Where your data goes</h2><p>Choose the model that fits your workflow.</p></div></div><div className="panelBody llmHelp">
        <h3>API provider</h3><p>The selected provider receives the preserved job description and your attached CV when an evaluation runs. API usage may incur charges.</p>
        <h3>Local model</h3><p>Start your model server on the same machine as GreenCV. Localhost refers to the GreenCV server’s machine. Choose a model that runs on your device; a local gateway can still forward requests to a cloud provider. Local evaluations do not use the paid API allowance.</p>
        <h3>Compatible providers</h3><p>Use OpenAI-compatible chat APIs for other providers and local servers, or select the native Claude or Ollama format. APIs with other formats need an adapter.</p>
        <h3>Your evaluation history</h3><p>Existing results stay available. Changing the provider, endpoint, or model creates a new evaluation the next time you evaluate a role.</p>
      </div></aside>
    </div>
  );
}
