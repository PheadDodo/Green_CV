// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ActivityRecorder } from "./activity-recorder";

const refresh = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

beforeEach(() => refresh.mockReset());

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ActivityRecorder", () => {
  it("converts a browser-local interview time to an absolute ISO instant", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ event: { id: "event-id" } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ActivityRecorder applicationId="application-id" />);

    fireEvent.change(screen.getByLabelText("Activity type"), {
      target: { value: "interview" },
    });
    const interviewAt = "2099-09-05T14:30";
    fireEvent.change(screen.getByLabelText("Interview time"), {
      target: { value: interviewAt },
    });
    fireEvent.submit(screen.getByLabelText("Interview time").closest("form")!);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject({
      kind: "interview",
      interviewAt: new Date(interviewAt).toISOString(),
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("recovers from a network failure instead of remaining pending", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<ActivityRecorder applicationId="application-id" />);

    fireEvent.submit(screen.getByRole("button", { name: "Add to timeline" }).closest("form")!);

    expect(await screen.findByText("Could not record activity.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Add to timeline" }) as HTMLButtonElement).disabled)
      .toBe(false);
  });
});
