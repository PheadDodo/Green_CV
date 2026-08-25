// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApplicationRecord, ApplicationStatus } from "@/lib/data/types";
import { PipelineBoard } from "./pipeline-board";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

function application(id: string, status: ApplicationStatus, title: string, company: string): ApplicationRecord {
  const timestamp = "2026-08-21T10:00:00.000Z";
  return {
    id,
    userId: "00000000-0000-4000-8000-000000000001",
    jobId: `job-${id}`,
    status,
    cvVersionId: null,
    notes: null,
    appliedAt: null,
    lastActivityAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
    job: {
      id: `job-${id}`,
      userId: "00000000-0000-4000-8000-000000000001",
      title,
      company,
      location: "Berlin",
      workplaceType: "hybrid",
      employmentType: "full_time",
      description: "A sufficiently detailed role description for the fixture.",
      source: "manual",
      sourceUrl: null,
      externalId: null,
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
      publishedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    cvVersion: null,
    latestEvaluation: null,
    events: [],
  };
}

describe("PipelineBoard", () => {
  beforeEach(() => {
    refresh.mockReset();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("keeps closed applications accessible and filters the list by stage and search", () => {
    render(<PipelineBoard applications={[
      application("open", "saved", "ML Platform Engineer", "Northstar"),
      application("closed", "rejected", "Data Scientist", "Orbit Labs"),
    ]} />);

    expect(screen.getByText("ML Platform Engineer")).toBeTruthy();
    expect(screen.getByText("Data Scientist")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Change Data Scientist at Orbit Labs in Berlin status" })).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Filter by stage"), { target: { value: "closed" } });
    expect(screen.queryByText("ML Platform Engineer")).toBeNull();
    expect(screen.getByText("Data Scientist")).toBeTruthy();
    expect(screen.getByText("Closed applications").closest("details")?.open).toBe(true);

    fireEvent.change(screen.getByLabelText("Search roles"), { target: { value: "Northstar" } });
    expect(screen.queryByText("Data Scientist")).toBeNull();
    expect(screen.getByText("No roles match these filters.")).toBeTruthy();
  });

  it("lets a closed application move back to an open stage", async () => {
    render(<PipelineBoard applications={[
      application("closed", "archived", "Research Engineer", "Acme"),
    ]} />);

    fireEvent.change(screen.getByRole("combobox", { name: "Change Research Engineer at Acme in Berlin status" }), {
      target: { value: "screening" },
    });

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/applications/closed/status",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "screening" }),
      }),
    ));
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  });

  it("opens closed results when an all-role search matches only a closed role", () => {
    render(<PipelineBoard applications={[
      application("open", "saved", "ML Platform Engineer", "Northstar"),
      application("closed", "rejected", "Data Scientist", "Orbit Labs"),
    ]} />);

    fireEvent.change(screen.getByLabelText("Search roles"), { target: { value: "Orbit" } });
    expect(screen.getByText("Closed applications").closest("details")?.open).toBe(true);
    expect(screen.getByText("Data Scientist")).toBeTruthy();
  });

  it("keeps concurrent cards disabled independently and gives duplicate titles unique names", async () => {
    let resolveFirst!: (value: { ok: boolean; json: () => Promise<object> }) => void;
    let resolveSecond!: (value: { ok: boolean; json: () => Promise<object> }) => void;
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve; }));
    vi.stubGlobal("fetch", fetchMock);

    render(<PipelineBoard applications={[
      application("first", "saved", "Software Engineer", "Northstar"),
      application("second", "saved", "Software Engineer", "Orbit Labs"),
    ]} />);

    const first = screen.getByRole("combobox", { name: "Change Software Engineer at Northstar in Berlin status" }) as HTMLSelectElement;
    const second = screen.getByRole("combobox", { name: "Change Software Engineer at Orbit Labs in Berlin status" }) as HTMLSelectElement;
    fireEvent.change(first, { target: { value: "applied" } });
    fireEvent.change(second, { target: { value: "screening" } });
    expect(first.disabled).toBe(true);
    expect(second.disabled).toBe(true);

    resolveFirst({ ok: true, json: async () => ({}) });
    await waitFor(() => expect(first.disabled).toBe(false));
    expect(second.disabled).toBe(true);

    resolveSecond({ ok: true, json: async () => ({}) });
    await waitFor(() => expect(second.disabled).toBe(false));
  });
});
