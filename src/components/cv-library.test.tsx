// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CvLibrary, type CvLibraryItemDto } from "./cv-library";

const refresh = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const cv: CvLibraryItemDto = {
  id: "cv-1",
  name: "ML Engineer v4",
  fileName: "alex-ml-engineer.pdf",
  mimeType: "application/pdf",
  isDefault: true,
  createdAt: "2026-08-26T08:00:00.000Z",
  hasPdfPreview: true,
  atsReport: {
    score: 84,
    rating: "Strong",
    wordCount: 642,
    checks: [
      {
        id: "parsing",
        label: "Text extraction",
        status: "pass",
        message: "The CV text is readable.",
      },
      {
        id: "formatting",
        label: "Formatting signals",
        status: "warning",
        message: "Review one unusually long line.",
      },
    ],
    disclaimer: "This compatibility check is guidance, not a hiring guarantee.",
  },
};

const pastedCv: CvLibraryItemDto = {
  ...cv,
  id: "cv-2",
  name: "Pasted profile",
  fileName: null,
  mimeType: "text/plain",
  isDefault: false,
  hasPdfPreview: false,
};

const createObjectURL = vi.fn(() => "http://localhost/cv-preview");
const revokeObjectURL = vi.fn();

describe("CvLibrary", () => {
  beforeEach(() => {
    refresh.mockClear();
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("opens an accessible ATS scan with the saved report", () => {
    render(<CvLibrary cvs={[cv]} />);

    fireEvent.click(screen.getByRole("button", { name: "ATS scan for ML Engineer v4" }));

    const dialog = screen.getByRole("dialog", { name: "ATS scan for ML Engineer v4" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(within(dialog).getByText("84/100")).toBeTruthy();
    expect(within(dialog).getByText("Strong")).toBeTruthy();
    expect(within(dialog).getByText("Text extraction")).toBeTruthy();
    expect(within(dialog).getByText("The CV text is readable.")).toBeTruthy();
    expect(within(dialog).getByText("This compatibility check is guidance, not a hiring guarantee.")).toBeTruthy();
  });

  it("closes the ATS dialog with Escape and returns focus to its action", () => {
    render(<CvLibrary cvs={[cv]} />);
    const opener = screen.getByRole("button", { name: "ATS scan for ML Engineer v4" });
    fireEvent.click(opener);
    const close = screen.getByRole("button", { name: "Close ATS scan for ML Engineer v4" });
    expect(document.activeElement).toBe(close);

    fireEvent.keyDown(close, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "ATS scan for ML Engineer v4" })).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("offers a Markdown download and only shows PDF preview when one exists", () => {
    render(<CvLibrary cvs={[cv, pastedCv]} />);

    expect(screen.getByRole("link", { name: "Download ML Engineer v4 as CV.md" }).getAttribute("href"))
      .toBe("/api/cvs/cv-1/markdown");
    expect(screen.getByRole("link", { name: "Download Pasted profile as CV.md" }).getAttribute("href"))
      .toBe("/api/cvs/cv-2/markdown");
    expect(screen.getByRole("button", { name: "View PDF for ML Engineer v4" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "View PDF for Pasted profile" })).toBeNull();
  });

  it("selects a CV as the default for future choices", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    render(<CvLibrary cvs={[cv, pastedCv]} />);

    fireEvent.click(screen.getByRole("button", { name: "Select CV for Pasted profile" }));

    await act(async () => undefined);
    expect(fetchMock).toHaveBeenCalledWith("/api/cvs/cv-2", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    });
    expect(refresh).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Select CV for ML Engineer v4" })).toBeTruthy();
    expect(within(screen.getByText("Pasted profile").closest("article")!).getByText("Selected")).toBeTruthy();
  });

  it("confirms and deletes a CV while explaining what history remains", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    render(<CvLibrary cvs={[cv, pastedCv]} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete CV for Pasted profile" }));

    const dialog = screen.getByRole("dialog", { name: "Delete Pasted profile?" });
    expect(within(dialog).getByText(/Historical evaluation results, including quoted CV evidence, and activity will remain/i)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete CV permanently" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/cvs/cv-2", {
      method: "DELETE",
    }));
    expect(refresh).toHaveBeenCalledOnce();
    expect(screen.queryByText("Pasted profile")).toBeNull();
  });

  it("keeps the confirmation open and shows an error when deletion fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        error: "The original file was removed, but the CV record remains. Retry deletion.",
      }),
    }));
    render(<CvLibrary cvs={[pastedCv]} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete CV for Pasted profile" }));
    const dialog = screen.getByRole("dialog", { name: "Delete Pasted profile?" });

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete CV permanently" }));

    expect((await within(dialog).findByRole("alert")).textContent)
      .toBe("The original file was removed, but the CV record remains. Retry deletion.");
    expect(screen.getByRole("dialog", { name: "Delete Pasted profile?" })).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("fetches a private PDF and embeds its Blob URL in a dialog", async () => {
    const pdf = new Blob(["%PDF-1.7"], { type: "application/pdf" });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: async () => pdf });
    vi.stubGlobal("fetch", fetchMock);
    render(<CvLibrary cvs={[cv]} />);

    fireEvent.click(screen.getByRole("button", { name: "View PDF for ML Engineer v4" }));

    const frame = await screen.findByTitle("PDF preview of ML Engineer v4");
    expect(frame.getAttribute("src")).toBe("http://localhost/cv-preview");
    expect(screen.getByRole("dialog", { name: "PDF preview of ML Engineer v4" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/cvs/cv-1/pdf",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(createObjectURL).toHaveBeenCalledWith(pdf);
  });

  it("revokes the PDF Blob URL when the preview closes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["%PDF-1.7"], { type: "application/pdf" }),
    }));
    render(<CvLibrary cvs={[cv]} />);
    fireEvent.click(screen.getByRole("button", { name: "View PDF for ML Engineer v4" }));
    await screen.findByTitle("PDF preview of ML Engineer v4");

    fireEvent.click(screen.getByRole("button", { name: "Close PDF preview of ML Engineer v4" }));

    expect(screen.queryByRole("dialog", { name: "PDF preview of ML Engineer v4" })).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith("http://localhost/cv-preview");
  });

  it("revokes the PDF Blob URL when the library unmounts", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["%PDF-1.7"], { type: "application/pdf" }),
    }));
    const { unmount } = render(<CvLibrary cvs={[cv]} />);
    fireEvent.click(screen.getByRole("button", { name: "View PDF for ML Engineer v4" }));
    await screen.findByTitle("PDF preview of ML Engineer v4");

    unmount();

    expect(revokeObjectURL).toHaveBeenCalledWith("http://localhost/cv-preview");
  });

  it("does not create a Blob URL when an in-flight preview outlives the library", async () => {
    let resolveFetch!: (response: { ok: boolean; blob: () => Promise<Blob> }) => void;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => new Promise((resolve) => {
      resolveFetch = resolve;
    })));
    const { unmount } = render(<CvLibrary cvs={[cv]} />);
    fireEvent.click(screen.getByRole("button", { name: "View PDF for ML Engineer v4" }));

    unmount();
    await act(async () => {
      resolveFetch({
        ok: true,
        blob: async () => new Blob(["%PDF-1.7"], { type: "application/pdf" }),
      });
    });

    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
