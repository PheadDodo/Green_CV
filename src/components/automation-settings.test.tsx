// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AutomationRule, AutomationRun } from "@/lib/data/types";
import { AutomationSettings } from "./automation-settings";

const refresh = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const timestamp = "2026-09-04T09:00:00.000Z";

function rule(
  id: string,
  type: AutomationRule["type"],
  config: AutomationRule["config"],
): AutomationRule {
  return {
    id,
    userId: "owner-id",
    type,
    enabled: true,
    config,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function run(
  id: string,
  type: AutomationRun["type"],
  status: AutomationRun["status"],
  attempts: number,
): AutomationRun {
  return {
    id,
    userId: "owner-id",
    ruleId: `${type}-rule`,
    applicationId: "application-id",
    type,
    status,
    idempotencyKey: `key-${id}`,
    errorMessage: null,
    attempts,
    scheduledAt: timestamp,
    startedAt: status === "running" ? timestamp : null,
    completedAt: ["succeeded", "failed", "cancelled"].includes(status) ? timestamp : null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

const rules = [
  rule("auto-rule", "auto_evaluate", { minimumDescriptionLength: 40 }),
  rule("follow-rule", "follow_up", { delayHours: 168 }),
  rule("interview-rule", "interview_prep", { leadHours: 24 }),
];

describe("AutomationSettings", () => {
  beforeEach(() => {
    refresh.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("edits reminder timing with canonical hour-based configuration", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rule: { ...rules[1], config: { delayHours: 240 } } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rule: { ...rules[2], config: { leadHours: 36 } } }),
      });
    vi.stubGlobal("fetch", fetchMock);
    render(<AutomationSettings initialRules={rules} initialRuns={[]} />);

    const delay = screen.getByRole("spinbutton", { name: "Follow-up delay (days)" }) as HTMLInputElement;
    expect(delay.value).toBe("7");
    fireEvent.change(delay, { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Save follow-up timing" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({
      id: "follow-rule",
      type: "follow_up",
      enabled: true,
      config: { delayHours: 240 },
    });

    const lead = screen.getByRole("spinbutton", { name: "Interview preparation lead time (hours)" });
    fireEvent.change(lead, { target: { value: "36" } });
    fireEvent.click(screen.getByRole("button", { name: "Save interview preparation timing" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toEqual({
      id: "interview-rule",
      type: "interview_prep",
      enabled: true,
      config: { leadHours: 36 },
    });
  });

  it("toggles auto-evaluation without sending or exposing its configuration", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ rule: { ...rules[0], enabled: false } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AutomationSettings initialRules={rules} initialRuns={[]} />);

    expect(screen.queryByLabelText(/minimum description/i)).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: "Disable Evaluate ready roles" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({
      id: "auto-rule",
      type: "auto_evaluate",
      enabled: false,
    });
  });

  it("offers cancellation only for pending or retryable reminder runs", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<AutomationSettings initialRules={rules} initialRuns={[
      run("pending-follow", "follow_up", "pending", 0),
      run("retry-interview", "interview_prep", "failed", 3),
      run("exhausted-follow", "follow_up", "failed", 4),
      run("running-follow", "follow_up", "running", 1),
      run("done-follow", "follow_up", "succeeded", 1),
      run("pending-evaluation", "auto_evaluate", "pending", 0),
    ]} />);

    expect(screen.getByRole("button", { name: "Cancel pending follow-up reminder run" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel interview preparation retry" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /exhausted-follow/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /pending-evaluation/ })).toBeNull();
    expect(screen.getAllByRole("button", { name: /Cancel .* (run|retry)$/ })).toHaveLength(2);
  });

  it("uses the cancellation endpoint and refreshes after success", async () => {
    const retry = run("retry-interview", "interview_prep", "failed", 2);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ run: { ...retry, status: "cancelled" } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AutomationSettings initialRules={rules} initialRuns={[retry]} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancel interview preparation retry" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/automations/runs/retry-interview",
      { method: "DELETE" },
    ));
    expect(refresh).toHaveBeenCalledOnce();
  });
});
