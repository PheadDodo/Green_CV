// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ApplicationStatusChart } from "./application-status-chart";

const statusData = [
  { status: "Saved" as const, value: 1 },
  { status: "Applied" as const, value: 4 },
  { status: "Screening" as const, value: 2 },
  { status: "Interview" as const, value: 2 },
  { status: "Offer" as const, value: 1 },
  { status: "Closed" as const, value: 2 },
];

afterEach(cleanup);

describe("ApplicationStatusChart", () => {
  it("shows accessible totals for the key application statuses", () => {
    render(<ApplicationStatusChart data={statusData} />);

    expect(screen.getByRole("img", {
      name: /current application status chart.*Applied: 4.*Interview: 2.*Offer: 1/i,
    })).toBeTruthy();

    const totals = screen.getByRole("list", { name: "Current application status totals" });
    expect(within(within(totals).getByText("Applied").closest("li")!).getByText("4")).toBeTruthy();
    expect(within(within(totals).getByText("Interview").closest("li")!).getByText("2")).toBeTruthy();
    expect(within(within(totals).getByText("Offer").closest("li")!).getByText("1")).toBeTruthy();
  });

  it("explains the empty chart before the first application is added", () => {
    render(<ApplicationStatusChart data={statusData.map(item => ({ ...item, value: 0 }))} />);

    expect(screen.getByText("Add your first role to see application status data.")).toBeTruthy();
  });
});
