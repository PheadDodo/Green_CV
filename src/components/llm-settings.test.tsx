// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LlmSettingsForm } from "./llm-settings";
import type { PublicLlmSettings } from "@/lib/llm/types";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const settings: PublicLlmSettings = { mode: "api", protocol: "openai", baseUrl: "https://api.openai.com/v1", model: "test-model", hasApiKey: true, updatedAt: null };
const fetchMock = vi.fn();
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function show(initialSettings = settings, localAvailable = true) { return render(<LlmSettingsForm initialSettings={initialSettings} localAvailable={localAvailable} defaultDescription="Deterministic demo evaluator" />); }

describe("LLM settings", () => {
  it("saves a changed model while preserving the write-only saved key", async () => {
    show();
    expect((screen.getByLabelText("API key") as HTMLInputElement).value).toBe("");
    fireEvent.change(screen.getByLabelText("Model name"), { target: { value: "new-model" } });
    expect((screen.getByRole("button", { name: "Test saved connection" }) as HTMLButtonElement).disabled).toBe(true);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ settings: { ...settings, model: "new-model" } }), { status: 200 }));
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    await screen.findByText("LLM settings saved. Future evaluations will use this selection.");
    const [, request] = fetchMock.mock.calls[0];
    expect(JSON.parse(request.body)).toEqual({ mode: "api", protocol: "openai", baseUrl: settings.baseUrl, model: "new-model", clearApiKey: false });
    expect(refresh).toHaveBeenCalled();
  });
  it("switches to a local server and saves without requiring an API key", async () => {
    show(); fireEvent.click(screen.getByRole("radio", { name: /Local LLM/ }));
    expect((screen.getByLabelText("Base URL") as HTMLInputElement).value).toBe("http://127.0.0.1:11434");
    fireEvent.change(screen.getByLabelText("Model name"), { target: { value: "local-model" } });
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ settings: { ...settings, mode: "local", protocol: "ollama", baseUrl: "http://127.0.0.1:11434", model: "local-model", hasApiKey: false } })));
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    await screen.findByRole("status");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).mode).toBe("local");
  });
  it("requires a fresh key when the API endpoint changes", () => {
    show(); fireEvent.change(screen.getByLabelText("Base URL"), { target: { value: "https://other.example/v1" } });
    expect((screen.getByLabelText("API key") as HTMLInputElement).required).toBe(true);
  });
  it("clears newly entered keys after saving and tests only saved settings", async () => {
    show(); fireEvent.change(screen.getByLabelText("API key"), { target: { value: "private-api-key" } });
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ settings })));
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    await screen.findByRole("status");
    expect((screen.getByLabelText("API key") as HTMLInputElement).value).toBe("");
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ message: "Connected without sending CV data." })));
    fireEvent.click(screen.getByRole("button", { name: "Test saved connection" }));
    await screen.findByText("Connected without sending CV data.");
    expect(fetchMock.mock.calls[1]).toEqual(["/api/settings/llm/test", { method: "POST" }]);
  });
  it("keeps edits after a server failure and explains local availability", async () => {
    show(settings, false);
    expect((screen.getByRole("radio", { name: /Local LLM/ }) as HTMLInputElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Model name"), { target: { value: "keep-edit" } });
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Settings could not be saved." }), { status: 500 }));
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Settings could not be saved."));
    expect((screen.getByLabelText("Model name") as HTMLInputElement).value).toBe("keep-edit");
  });
});
