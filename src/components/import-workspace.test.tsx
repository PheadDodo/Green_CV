// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ImportWorkspace } from "./import-workspace";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

const importedJob = {
  title: "ML Engineer",
  company: "Northstar",
  description: "Build and operate reliable machine-learning systems for production products.",
  location: "Berlin",
  workplaceType: "hybrid",
  employmentType: "full_time",
};

describe("ImportWorkspace", () => {
  beforeEach(() => {
    router.push.mockReset();
    router.refresh.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("preserves CSV preview provenance from validation through commit", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jobs: [importedJob],
          jobRows: [2],
          errors: [{ row: 3, message: "Company is required" }],
          totalRows: 2,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          applications: [{ id: "app-1" }],
          errors: [{ row: 3, message: "Company is required" }],
          failedRows: 1,
          succeededRows: 1,
          totalRows: 2,
        }),
      });
    vi.stubGlobal("fetch", fetchMock);
    render(<ImportWorkspace />);

    const file = new File(["title,company,description"], "my-search-history.csv", {
      type: "text/csv",
    });
    Object.defineProperty(file, "text", {
      value: vi.fn().mockResolvedValue("title,company,description"),
    });
    const fileInput = screen.getByLabelText("Jobs CSV file") as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });
    fireEvent.submit(fileInput.closest("form")!);

    await screen.findByRole("button", { name: "Import 1 roles" });
    fireEvent.click(screen.getByRole("button", { name: "Import 1 roles" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const previewBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const commitBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(previewBody.fileName).toBe("my-search-history.csv");
    expect(commitBody.fileName).toBe("my-search-history.csv");
    expect(commitBody.commit).toBe(true);
    expect(commitBody.totalRows).toBe(2);
    expect(commitBody.jobRows).toEqual([2]);
    expect(commitBody.previewErrors).toEqual([
      { row: 3, message: "Company is required" },
    ]);
  });

  it("commits a reviewed URL import through the audited import endpoint", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          job: {
            title: "ML Engineer",
            company: "Northstar",
            text: importedJob.description,
            finalUrl: "https://northstar.example/jobs/ml-engineer",
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ application: { id: "app-1" }, errors: [] }),
      });
    vi.stubGlobal("fetch", fetchMock);
    render(<ImportWorkspace />);

    fireEvent.click(screen.getByRole("button", { name: "Job URL" }));
    fireEvent.change(screen.getByLabelText("Public job listing URL"), {
      target: { value: "https://northstar.example/jobs/ml-engineer" },
    });
    fireEvent.submit(screen.getByLabelText("Public job listing URL").closest("form")!);
    await screen.findByDisplayValue("ML Engineer");

    fireEvent.change(screen.getByLabelText("Location"), { target: { value: "Berlin" } });
    fireEvent.change(screen.getByLabelText("Workplace type"), { target: { value: "hybrid" } });
    fireEvent.change(screen.getByLabelText("Employment type"), { target: { value: "temporary" } });
    fireEvent.click(screen.getByRole("button", { name: "Save to pipeline" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1][0]).toBe("/api/imports/url");
    const commitBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(commitBody).toMatchObject({
      commit: true,
      title: "ML Engineer",
      company: "Northstar",
      location: "Berlin",
      workplaceType: "hybrid",
      employmentType: "temporary",
      sourceUrl: "https://northstar.example/jobs/ml-engineer",
    });
    expect(router.push).toHaveBeenCalledWith("/applications/app-1");
  });
});
