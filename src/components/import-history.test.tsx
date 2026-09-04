// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ImportBatch } from "@/lib/data/types";
import { ImportHistory } from "./import-history";

const refresh = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

beforeEach(() => {
  refresh.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ImportHistory", () => {
  it("shows stored row-level failures with their batch", () => {
    const batch: ImportBatch = {
      id: "batch-1",
      userId: "owner-id",
      source: "csv",
      fileName: "applications.csv",
      status: "partial",
      totalRows: 3,
      processedRows: 3,
      succeededRows: 2,
      failedRows: 1,
      errors: [
        { row: 4, message: "Company is required" },
        { row: 4, message: "Unknown workplace type" },
      ],
      createdAt: "2026-09-04T10:00:00.000Z",
      updatedAt: "2026-09-04T10:01:00.000Z",
      completedAt: "2026-09-04T10:01:00.000Z",
    };

    render(<ImportHistory batches={[batch]} />);

    expect(screen.getByText("applications.csv")).toBeTruthy();
    expect(screen.getByText("2/3 imported")).toBeTruthy();
    expect(screen.getByText("1 failed row · 2 issues")).toBeTruthy();
    expect(screen.getByText("Row 4: Company is required")).toBeTruthy();
  });

  it("distinguishes an empty history from a successful batch with no errors", () => {
    const { rerender } = render(<ImportHistory batches={[]} />);
    expect(screen.getByText("No imports yet. Manual roles are not included here.")).toBeTruthy();

    rerender(<ImportHistory batches={[{
      id: "batch-2",
      userId: "owner-id",
      source: "url",
      fileName: "https://northstar.example/jobs/ml-engineer",
      status: "completed",
      totalRows: 1,
      processedRows: 1,
      succeededRows: 1,
      failedRows: 0,
      errors: [],
      createdAt: "2026-09-04T10:00:00.000Z",
      updatedAt: "2026-09-04T10:00:00.000Z",
      completedAt: "2026-09-04T10:00:00.000Z",
    }]} />);

    expect(screen.queryByText(/Row /)).toBeNull();
    expect(screen.getByText("1/1 imported")).toBeTruthy();
  });

  it("requires confirmation and explains that imported applications remain", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const batch = batchFixture();
    render(<ImportHistory batches={[batch]} />);

    fireEvent.click(screen.getByRole("button", {
      name: "Delete import history for applications.csv",
    }));

    const dialog = screen.getByRole("dialog", {
      name: "Delete import history for applications.csv?",
    });
    expect(within(dialog).getByText(/only the audit batch and its row-level error details/i))
      .toBeTruthy();
    expect(within(dialog).getByText(/imported applications will remain/i)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cancels without deleting and returns focus to the batch control", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<ImportHistory batches={[batchFixture()]} />);
    const opener = screen.getByRole("button", {
      name: "Delete import history for applications.csv",
    });
    fireEvent.click(opener);

    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("deletes the audit batch, removes it from history, and refreshes the count", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    render(<ImportHistory batches={[batchFixture()]} />);
    fireEvent.click(screen.getByRole("button", {
      name: "Delete import history for applications.csv",
    }));

    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", {
      name: "Delete import history permanently",
    }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/imports/10000000-0000-4000-8000-000000000001",
      { method: "DELETE" },
    ));
    expect(screen.getByText("No imports yet. Manual roles are not included here.")).toBeTruthy();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("keeps the audit batch and shows a safe error when deletion fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Could not delete this import history." }),
    }));
    render(<ImportHistory batches={[batchFixture()]} />);
    fireEvent.click(screen.getByRole("button", {
      name: "Delete import history for applications.csv",
    }));

    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", {
      name: "Delete import history permanently",
    }));

    expect((await screen.findByRole("alert")).textContent)
      .toBe("Could not delete this import history.");
    expect(screen.getByText("applications.csv")).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });
});

function batchFixture(overrides: Partial<ImportBatch> = {}): ImportBatch {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    userId: "owner-id",
    source: "csv",
    fileName: "applications.csv",
    status: "completed",
    totalRows: 1,
    processedRows: 1,
    succeededRows: 1,
    failedRows: 0,
    errors: [],
    createdAt: "2026-09-04T10:00:00.000Z",
    updatedAt: "2026-09-04T10:00:00.000Z",
    completedAt: "2026-09-04T10:00:00.000Z",
    ...overrides,
  };
}
