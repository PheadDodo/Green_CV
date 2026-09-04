// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ApplicationJobMetadata } from "./application-job-metadata";

afterEach(cleanup);

describe("ApplicationJobMetadata", () => {
  it("shows the salary range and published date when the job provides them", () => {
    render(<ApplicationJobMetadata job={{
      workplaceType: "hybrid",
      employmentType: "full_time",
      source: "csv",
      salaryMin: 80_000,
      salaryMax: 120_000,
      salaryCurrency: "USD",
      publishedAt: "2026-08-01T00:00:00.000Z",
    }} />);

    expect(screen.getByText("Salary")).toBeTruthy();
    expect(screen.getByText("USD 80,000–120,000")).toBeTruthy();
    expect(screen.getByText("Published")).toBeTruthy();
    expect(screen.getByText("Aug 1, 2026")).toBeTruthy();
  });

  it("omits salary and published facts when the job does not provide them", () => {
    render(<ApplicationJobMetadata job={{
      workplaceType: "remote",
      employmentType: "contract",
      source: "manual",
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
      publishedAt: null,
    }} />);

    expect(screen.queryByText("Salary")).toBeNull();
    expect(screen.queryByText("Published")).toBeNull();
    expect(screen.getByText("remote")).toBeTruthy();
    expect(screen.getByText("contract")).toBeTruthy();
    expect(screen.getByText("manual")).toBeTruthy();
  });
});
