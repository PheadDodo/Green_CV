import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("application stages persist after reload and update both dashboard charts", async ({ page }) => {
  const title = `Browser test role ${randomUUID()}`;
  const company = "Example Test Company";
  await page.goto("/dashboard");
  const statusChart = page.getByRole("img", { name: /^Current application status chart\./ });
  const funnelChart = page.getByRole("img", { name: /^Application funnel chart\./ });
  const statusBefore = await statusChart.getAttribute("aria-label");
  const funnelBefore = await funnelChart.getAttribute("aria-label");
  expect(chartStages(statusBefore ?? "")).toEqual(["Saved", "Applied", "Screening", "Interview", "Offer", "Closed"]);
  expect(chartStages(funnelBefore ?? "")).toEqual(["Discovered", "Applied", "Responded", "Interview", "Offer"]);

  async function expectCharts(statusDelta: Record<string, number>, funnelDelta: Record<string, number>) {
    await page.goto("/dashboard");
    await expect(statusChart).toHaveAttribute("aria-label", withCounts(statusBefore!, statusDelta));
    await expect(funnelChart).toHaveAttribute("aria-label", withCounts(funnelBefore!, funnelDelta));
  }

  await page.getByRole("button", { name: "Add role", exact: true }).click();
  const form = page.getByRole("form", { name: "Add a job application" });
  await form.getByLabel("Job title", { exact: true }).fill(title);
  await form.getByLabel("Company", { exact: true }).fill(company);
  await form.getByLabel("Location", { exact: true }).fill("Remote");
  await form.getByLabel("Job description snapshot").fill(
    "Build accessible web applications with TypeScript and SQL. This is fictional browser-test data.",
  );
  await form.getByLabel("Starting status").selectOption("applied");
  await form.getByLabel("Attach CV version").selectOption("");
  await form.getByRole("button", { name: "Save role", exact: true }).click();
  await expect(page).toHaveURL(/\/applications\/[^/]+$/);
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  const applicationUrl = page.url();
  await expectCharts({ Applied: 1 }, { Discovered: 1, Applied: 1 });

  for (const stage of ["Interview", "Offer"]) {
    await page.goto("/applications");
    await page.getByRole("combobox", {
      name: `Change ${title} at ${company} in Remote status`, exact: true,
    }).selectOption(stage.toLowerCase());
    const lane = page.getByRole("region", { name: `${stage} applications`, exact: true });
    await expect(lane.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await page.reload();
    await expect(lane.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await expectCharts({ [stage]: 1 }, {
      Discovered: 1, Applied: 1, Responded: 1, Interview: 1,
      ...(stage === "Offer" ? { Offer: 1 } : {}),
    });
  }

  await page.goto(applicationUrl);
  await page.getByRole("button", { name: `Delete application for ${title} at ${company}` }).click();
  await page.getByRole("dialog", { name: `Delete ${title} at ${company}?`, exact: true })
    .getByRole("button", { name: "Delete application permanently", exact: true }).click();
  await expect(page).toHaveURL(/\/applications$/);
  await page.reload();
  await expect(page.getByRole("heading", { name: title, exact: true })).toHaveCount(0);
  await expectCharts({}, {});
});

function withCounts(summary: string, increments: Record<string, number>) {
  return summary.replace(/([A-Za-z]+): (\d+)/g, (_, label: string, value: string) =>
    `${label}: ${Number(value) + (increments[label] ?? 0)}`,
  );
}

function chartStages(summary: string) {
  return Array.from(summary.matchAll(/([A-Za-z]+): (\d+)/g), match => match[1]);
}
