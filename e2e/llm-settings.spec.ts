import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { expect, test } from "@playwright/test";

test("saved local LLM settings survive reload and drive a real evaluation", async ({ page }) => {
  let generations = 0;
  const generationInputs: Record<string, unknown>[] = [];
  const server = createServer(async (request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/api/tags" && request.method === "GET") {
      response.end(JSON.stringify({ models: [{ name: "fictional-local-model:latest" }] }));
      return;
    }
    if (request.url === "/api/chat" && request.method === "POST") {
      let body = "";
      for await (const chunk of request) body += chunk;
      const payload = JSON.parse(body);
      generationInputs.push(payload);
      generations++;
      response.end(JSON.stringify({ done: true, message: { content: JSON.stringify({
        recommendation: "consider", overallScore: 55, summary: "Evaluation from the selected local model.",
        strongMatches: [], partialMatches: [], gaps: [], suggestedEdits: [], keywords: [],
      }) } }));
      return;
    }
    response.statusCode = 404; response.end("{}");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing local test port.");
  const cvName = `LLM browser CV ${randomUUID()}`;
  let cvId = "";
  let applicationId = "";
  try {
    // This scenario checks explicit evaluation; keep seeded demo-role automation
    // from generating unrelated requests when the provider preference changes.
    expect((await page.request.patch("/api/automations/rules", { data: { type: "auto_evaluate", enabled: false } })).status()).toBe(200);
    await page.goto("/settings/llm");
    await page.getByRole("radio", { name: /Local LLM/ }).check();
    await page.getByLabel("Base URL").fill(`http://127.0.0.1:${address.port}`);
    await page.getByLabel("Model name").fill("fictional-local-model");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByRole("status")).toContainText("LLM settings saved");
    await page.reload();
    await expect(page.getByLabel("Model name")).toHaveValue("fictional-local-model");
    await page.getByRole("button", { name: "Test saved connection" }).click();
    await expect(page.getByRole("status")).toContainText("Your selected model is listed");
    await page.screenshot({ path: test.info().outputPath("llm-settings.png"), fullPage: true });
    expect(generations).toBe(0);

    expect((await page.request.post("/api/cvs", { data: { name: cvName, content: "# Fictional CV\n\nBuilt fictional TypeScript applications." } })).status()).toBe(201);
    const created = await page.request.post("/api/applications", { data: {
      title: "Fictional LLM browser role", company: "Example LLM Test Company",
      description: "Build fictional TypeScript applications, write reliable tests, and document accessible software. This role is test data only.", cvVersionId: "",
    } });
    expect(created.status()).toBe(201);
    applicationId = (await created.json()).application.id;
    await page.goto(`/applications/${applicationId}`);
    const picker = page.getByLabel("CV version", { exact: true });
    cvId = (await picker.getByRole("option", { name: cvName, exact: true }).getAttribute("value"))!;
    await picker.selectOption(cvId);
    await page.getByRole("button", { name: "Evaluate role fit", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/applications/${applicationId}/evaluation$`));
    await expect(page.getByText("Evaluation from the selected local model.", { exact: true })).toBeVisible();
    expect(generations).toBeGreaterThan(0);
    expect(generationInputs).toEqual(expect.arrayContaining([expect.objectContaining({
      model: "fictional-local-model", format: expect.objectContaining({ type: "object" }),
      messages: expect.arrayContaining([expect.objectContaining({ content: expect.stringContaining("Built fictional TypeScript applications.") })]),
    })]));
    const result = await page.request.post(`/api/applications/${applicationId}/evaluations`, { data: {} });
    expect(result.status()).toBe(200);
    const stored = await result.json();
    expect(stored.reused).toBe(true); expect(stored.evaluation.model).toBe("fictional-local-model");
    expect(stored.evaluation.providerMode).toBe("local");
  } finally {
    await page.request.put("/api/settings/llm", { data: { mode: "default", protocol: "openai", baseUrl: "", model: "" } });
    await page.request.patch("/api/automations/rules", { data: { type: "auto_evaluate", enabled: true } });
    if (applicationId) await page.request.delete(`/api/applications/${applicationId}`);
    if (cvId) await page.request.delete(`/api/cvs/${cvId}`);
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
