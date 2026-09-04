// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DeleteApplication } from "./delete-application";

const replace = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

describe("DeleteApplication", () => {
  beforeEach(() => {
    replace.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("requires explicit confirmation and explains the deletion boundary", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<DeleteApplication
      applicationId="application/with spaces"
      jobTitle="ML Engineer"
      company="Northstar"
    />);

    fireEvent.click(screen.getByRole("button", { name: "Delete application for ML Engineer at Northstar" }));

    const dialog = screen.getByRole("dialog", { name: "Delete ML Engineer at Northstar?" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(within(dialog).getByText(/job snapshot, timeline, reminders, and evaluation history/i)).toBeTruthy();
    expect(within(dialog).getByText(/CV library entry will remain/i)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cancels without deleting and returns focus to the opener", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<DeleteApplication applicationId="app-1" jobTitle="ML Engineer" company="Northstar" />);
    const opener = screen.getByRole("button", { name: "Delete application for ML Engineer at Northstar" });
    fireEvent.click(opener);

    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("deletes the application and replaces the detail route", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    render(<DeleteApplication
      applicationId="application/with spaces"
      jobTitle="ML Engineer"
      company="Northstar"
    />);
    fireEvent.click(screen.getByRole("button", { name: "Delete application for ML Engineer at Northstar" }));

    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete application permanently" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/applications/application%2Fwith%20spaces",
      { method: "DELETE" },
    ));
    expect(replace).toHaveBeenCalledWith("/applications");
  });

  it("keeps the confirmation open and shows a safe error after failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Could not delete this application." }),
    }));
    render(<DeleteApplication applicationId="app-1" jobTitle="ML Engineer" company="Northstar" />);
    fireEvent.click(screen.getByRole("button", { name: "Delete application for ML Engineer at Northstar" }));

    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete application permanently" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Could not delete this application.");
    expect(screen.getByRole("dialog", { name: "Delete ML Engineer at Northstar?" })).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });
});
