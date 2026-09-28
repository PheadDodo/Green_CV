import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("CV upload, artifacts, selection, and deletion work across real application pages", async ({ page }) => {
  const cvName = `Browser test CV ${randomUUID()}`;
  // Generate a real text-based PDF in memory, using only fictional content.
  // No personal CV fixture is read from disk or committed to the repository.
  await page.setContent(`<!doctype html><html lang="en"><head><style>
    body { font-family: Arial, sans-serif; font-size: 12px; padding: 24px; }
    h1 { font-size: 20px; } h2 { font-size: 15px; margin-top: 18px; }
  </style></head><body>
    <h1>Alex Example</h1><p>alex@example.com</p>
    <h2>PROFESSIONAL SUMMARY</h2>
    <p>Software engineer building accessible web applications and reliable data tools.</p>
    <h2>CORE SKILLS</h2><p>Programming: TypeScript, Python, SQL</p>
    <h2>RELEVANT RESEARCH AND PROJECTS</h2>
    <p>Built SQL data pipelines for a fictional research project.</p>
    <h2>EXPERIENCE</h2>
    <p>Example Company: Developed accessible dashboards and tested application workflows.</p>
    <h2>EDUCATION</h2><p>Example University: BSc Computer Science</p>
  </body></html>`);
  const pdf = await page.pdf({ format: "A4" });

  await page.goto("/cvs");
  await page.getByRole("button", { name: "New CV version", exact: true }).click();
  const upload = page.locator("form").filter({
    has: page.getByRole("heading", { name: "Import a CV", exact: true }),
  });
  await upload.getByLabel("Version name", { exact: true }).fill(cvName);
  await upload.locator('input[name="file"]').setInputFiles({
    name: "fictional-cv.pdf", mimeType: "application/pdf", buffer: pdf,
  });
  await upload.getByRole("button", { name: "Create version", exact: true }).click();
  const viewPdf = page.getByRole("button", { name: `View PDF for ${cvName}`, exact: true });
  await expect(viewPdf).toBeVisible();

  const pdfResponsePromise = page.waitForResponse(response =>
    /\/api\/cvs\/[^/]+\/pdf$/.test(response.url()),
  );
  await viewPdf.click();
  const pdfResponse = await pdfResponsePromise;
  expect(pdfResponse.status()).toBe(200);
  expect(pdfResponse.headers()["content-type"]).toContain("application/pdf");
  const preview = page.getByRole("dialog", { name: `PDF preview of ${cvName}`, exact: true });
  const frame = preview.getByTitle(`PDF preview of ${cvName}`, { exact: true });
  await expect(frame).toHaveAttribute("src", /^blob:/);
  const blobUrl = await frame.getAttribute("src");
  // Check the actual document supplied to the viewer. Chromium's network
  // inspector can return an empty response body for PDFs despite a valid fetch.
  const previewBytes = await page.evaluate(async (url) => {
    const response = await fetch(url!);
    return Array.from(new Uint8Array(await response.arrayBuffer()));
  }, blobUrl);
  expect(previewBytes.length).toBe(pdf.length);
  expect(Buffer.from(previewBytes).equals(pdf)).toBe(true);
  await preview.getByRole("button", { name: `Close PDF preview of ${cvName}`, exact: true }).click();

  await page.getByRole("button", { name: `ATS scan for ${cvName}`, exact: true }).click();
  const ats = page.getByRole("dialog", { name: `ATS scan for ${cvName}`, exact: true });
  const sections = ats.getByRole("listitem").filter({ hasText: "Standard sections" });
  await expect(sections.getByText("pass", { exact: true })).toBeVisible();
  await expect(ats.getByText(/not a guarantee from any employer/)).toBeVisible();
  await ats.getByRole("button", { name: `Close ATS scan for ${cvName}`, exact: true }).click();

  const markdownLink = page.getByRole("link", { name: `Download ${cvName} as CV.md`, exact: true });
  const markdownUrl = await markdownLink.getAttribute("href");
  const downloadPromise = page.waitForEvent("download");
  await markdownLink.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("CV.md");
  const markdown = await readFile(await download.path(), "utf8");
  expect(markdown).toContain("## Core Skills");
  expect(markdown).toContain("## Relevant Research and Projects");
  expect(markdown).toContain("Programming: TypeScript, Python, SQL");
  expect(markdown).toContain("Built SQL data pipelines");

  // Selection is a default for future choices, not a rewrite of attachments.
  await page.getByRole("button", { name: `Select CV for ${cvName}`, exact: true }).click();
  const unselect = page.getByRole("button", { name: `Unselect CV for ${cvName}`, exact: true });
  await expect(unselect).toBeVisible();
  await page.reload();
  await expect(unselect).toBeVisible();
  await page.goto("/applications");
  await page.getByRole("button", { name: "New role", exact: true }).click();
  const form = page.getByRole("form", { name: "Add a job application" });
  const cvChoice = form.getByLabel("Attach CV version");
  await expect(cvChoice.locator("option:checked")).toHaveText(cvName);
  const cvId = await cvChoice.inputValue();
  const title = `CV attachment role ${randomUUID()}`;
  const company = "Example Attachment Company";
  await form.getByLabel("Job title", { exact: true }).fill(title);
  await form.getByLabel("Company", { exact: true }).fill(company);
  await form.getByLabel("Job description snapshot").fill(
    "Develop accessible TypeScript applications and SQL data tools. Fictional browser-test role.",
  );
  await form.getByRole("button", { name: "Save role", exact: true }).click();
  await expect(page).toHaveURL(/\/applications\/[^/]+$/);
  const applicationUrl = page.url();
  await expect(page.getByLabel("CV version", { exact: true })).toHaveValue(cvId);
  await expect(page.getByRole("button", { name: "Attach selected CV", exact: true })).toBeDisabled();

  await page.goto("/cvs");
  await unselect.click();
  await expect(page.getByRole("button", { name: `Select CV for ${cvName}`, exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: /^Unselect CV for / })).toHaveCount(0);
  await page.goto("/applications");
  await page.getByRole("button", { name: "New role", exact: true }).click();
  await expect(cvChoice).toHaveValue("");
  await form.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.goto(applicationUrl);
  await expect(page.getByLabel("CV version", { exact: true })).toHaveValue(cvId);
  await expect(page.getByRole("button", { name: "Attach selected CV", exact: true })).toBeDisabled();

  await page.goto("/cvs");
  const deleteCv = page.getByRole("button", { name: `Delete CV for ${cvName}`, exact: true });
  await deleteCv.click();
  const confirmation = page.getByRole("dialog", { name: `Delete ${cvName}?`, exact: true });
  await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(viewPdf).toBeVisible();
  await deleteCv.click();
  await confirmation.getByRole("button", { name: "Delete CV permanently", exact: true }).click();
  await expect(deleteCv).toHaveCount(0);
  await page.reload();
  await expect(viewPdf).toHaveCount(0);
  expect((await page.request.get(markdownUrl!)).status()).toBe(404);
  expect((await page.request.get(pdfResponse.url())).status()).toBe(404);

  await page.goto(applicationUrl);
  await expect(page.getByLabel("CV version", { exact: true })).toHaveValue("");
  await expect(page.getByRole("button", { name: "Attach selected CV", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: `Delete application for ${title} at ${company}` }).click();
  await page.getByRole("dialog", { name: `Delete ${title} at ${company}?`, exact: true })
    .getByRole("button", { name: "Delete application permanently", exact: true }).click();
  await expect(page).toHaveURL(/\/applications$/);
  await expect(page.getByRole("heading", { name: title, exact: true })).toHaveCount(0);
});
