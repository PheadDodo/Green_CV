// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getDataRepository: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/data", () => ({ getDataRepository: mocks.getDataRepository }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import DashboardPage from "./page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("DashboardPage", () => {
  it("shows both the recent funnel and current application status charts", async () => {
    mocks.requireUser.mockResolvedValue({ id: "user-1", displayName: "Alex Green" });
    mocks.getDataRepository.mockResolvedValue({
      listApplications: vi.fn().mockResolvedValue([]),
      listCvVersions: vi.fn().mockResolvedValue([]),
      listReminders: vi.fn().mockResolvedValue([]),
    });

    render(await DashboardPage());

    expect(screen.getByRole("heading", { name: "Application funnel" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Current application status" })).toBeTruthy();
    expect(screen.getByRole("img", { name: /current application status chart/i })).toBeTruthy();
  });

  it("turns pending reminders into dashboard actions", async () => {
    mocks.requireUser.mockResolvedValue({ id: "user-1", displayName: "Alex Green" });
    mocks.getDataRepository.mockResolvedValue({
      listApplications: vi.fn().mockResolvedValue([]),
      listCvVersions: vi.fn().mockResolvedValue([]),
      listReminders: vi.fn().mockResolvedValue([{
        id: "reminder-1",
        userId: "user-1",
        applicationId: "application-1",
        title: "Follow up with Northstar",
        notes: null,
        dueAt: "2026-09-03T09:00:00.000Z",
        status: "pending",
        completedAt: null,
        createdAt: "2026-09-01T09:00:00.000Z",
        updatedAt: "2026-09-01T09:00:00.000Z",
      }]),
    });

    render(await DashboardPage());

    expect(screen.getByRole("button", { name: "Complete Follow up with Northstar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Dismiss Follow up with Northstar" })).toBeTruthy();
    expect(screen.getByRole("link", {
      name: "Open application for Follow up with Northstar",
    }).getAttribute("href"))
      .toBe("/applications/application-1");
  });
});
