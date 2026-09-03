// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const refresh = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

import { DashboardReminders, type DashboardReminderDto } from "./dashboard-reminders";

const reminders: DashboardReminderDto[] = [
  {
    id: "reminder-1",
    applicationId: "application-1",
    title: "Follow up with Northstar",
    dueAt: "2026-09-01T09:00:00.000Z",
  },
  {
    id: "reminder-2",
    applicationId: null,
    title: "Refresh portfolio notes",
    dueAt: "2026-09-03T09:00:00.000Z",
  },
];

afterEach(() => {
  cleanup();
  refresh.mockClear();
  vi.unstubAllGlobals();
});

describe("DashboardReminders", () => {
  it("distinguishes overdue reminders and links reminders to their application", () => {
    render(<DashboardReminders reminders={reminders} nowIso="2026-09-02T12:00:00.000Z" />);

    expect(screen.getByRole("heading", { name: "Pending reminders" })).toBeTruthy();
    const overdueReminder = screen.getByRole("article", { name: "Follow up with Northstar" });
    expect(within(overdueReminder).getByText("Overdue")).toBeTruthy();
    const dueTime = within(overdueReminder).getByRole("time");
    expect(dueTime.getAttribute("dateTime")).toBe("2026-09-01T09:00:00.000Z");
    expect(dueTime.textContent).toBe("Sep 1, 9 AM UTC");
    expect(within(overdueReminder).getByRole("link", {
      name: "Open application for Follow up with Northstar",
    }).getAttribute("href"))
      .toBe("/applications/application-1");

    const upcomingReminder = screen.getByRole("article", { name: "Refresh portfolio notes" });
    expect(within(upcomingReminder).queryByText("Overdue")).toBeNull();
    expect(within(upcomingReminder).queryByRole("link", { name: /Open application/ })).toBeNull();
  });

  it("marks a reminder due now as overdue", () => {
    render(<DashboardReminders reminders={[{
      ...reminders[0],
      dueAt: "2026-09-02T12:00:00.000Z",
    }]} nowIso="2026-09-02T12:00:00.000Z" />);

    expect(screen.getByText("Overdue")).toBeTruthy();
  });

  it("completes a reminder and immediately promotes the next pending item", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const fourReminders = [
      ...reminders,
      { id: "reminder-3", applicationId: null, title: "Prepare interview stories", dueAt: "2026-09-04T09:00:00.000Z" },
      { id: "reminder-4", applicationId: null, title: "Review salary range", dueAt: "2026-09-05T09:00:00.000Z" },
    ];
    render(<DashboardReminders reminders={fourReminders} nowIso="2026-09-02T12:00:00.000Z" />);

    expect(screen.queryByText("Review salary range")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Complete Follow up with Northstar" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/reminders/reminder-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    }));
    expect(screen.queryByRole("article", { name: "Follow up with Northstar" })).toBeNull();
    expect(screen.getByText("Review salary range")).toBeTruthy();
    expect(screen.getByLabelText("3 pending reminders")).toBeTruthy();
    expect(refresh).toHaveBeenCalledOnce();
    expect(screen.getByText("Follow up with Northstar marked complete.")).toBeTruthy();
    await waitFor(() => expect(document.activeElement)
      .toBe(screen.getByRole("article", { name: "Refresh portfolio notes" })));
  });

  it("dismisses a reminder without deleting its application", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    render(<DashboardReminders reminders={[reminders[0]]} nowIso="2026-09-02T12:00:00.000Z" />);

    expect(screen.getByLabelText("1 pending reminder")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss Follow up with Northstar" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/reminders/reminder-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "dismissed" }),
    }));
    expect(screen.queryByRole("article", { name: "Follow up with Northstar" })).toBeNull();
    expect(refresh).toHaveBeenCalledOnce();
    expect(screen.getByRole("status").textContent)
      .toContain("You’re all caught up. No pending reminders.");
    expect(screen.getByText("Follow up with Northstar dismissed.")).toBeTruthy();
    await waitFor(() => expect(document.activeElement)
      .toBe(screen.getByRole("heading", { name: "Pending reminders" })));
  });

  it("keeps a reminder actionable and explains a failed update", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Reminder service is unavailable." }),
    }));
    render(<DashboardReminders reminders={[reminders[0]]} nowIso="2026-09-02T12:00:00.000Z" />);

    fireEvent.click(screen.getByRole("button", { name: "Complete Follow up with Northstar" }));

    const alert = await screen.findByRole("alert");
    const failedReminder = screen.getByRole("article", { name: "Follow up with Northstar" });
    expect(alert.textContent).toBe("Reminder service is unavailable.");
    expect(failedReminder.contains(alert)).toBe(true);
    const retryButton = screen.getByRole("button", { name: "Complete Follow up with Northstar" });
    expect(retryButton.getAttribute("aria-describedby")).toBe(alert.id);
    expect(retryButton.hasAttribute("disabled"))
      .toBe(false);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("disables only the reminder being updated and exposes its progress", async () => {
    let resolveFetch!: (response: { ok: boolean }) => void;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => new Promise((resolve) => {
      resolveFetch = resolve;
    })));
    render(<DashboardReminders reminders={reminders} nowIso="2026-09-02T12:00:00.000Z" />);

    fireEvent.click(screen.getByRole("button", { name: "Complete Follow up with Northstar" }));

    const activeReminder = screen.getByRole("article", { name: "Follow up with Northstar" });
    expect(activeReminder.getAttribute("aria-busy")).toBe("true");
    expect(within(activeReminder).getByRole("button", { name: "Completing Follow up with Northstar" }).hasAttribute("disabled"))
      .toBe(true);
    expect(within(activeReminder).getByRole("button", { name: "Dismiss Follow up with Northstar" }).hasAttribute("disabled"))
      .toBe(true);
    expect(screen.getByRole("button", { name: "Complete Refresh portfolio notes" }).hasAttribute("disabled"))
      .toBe(false);

    await act(async () => resolveFetch({ ok: true }));
  });

  it("shows a useful empty state when there are no pending reminders", () => {
    render(<DashboardReminders reminders={[]} nowIso="2026-09-02T12:00:00.000Z" />);

    expect(screen.getByRole("status").textContent)
      .toContain("You’re all caught up. No pending reminders.");
  });
});
