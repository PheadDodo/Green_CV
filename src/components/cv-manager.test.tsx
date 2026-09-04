// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CvUploader, ManualCvForm } from "./cv-manager";

const refresh = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

beforeEach(() => refresh.mockReset());

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CvUploader", () => {
  it("recovers from a network failure instead of leaving CV upload pending", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<CvUploader />);

    fireEvent.click(screen.getByRole("button", { name: "New CV version" }));
    fireEvent.change(screen.getByLabelText("Version name"), {
      target: { value: "ML Engineer CV" },
    });
    fireEvent.change(document.querySelector('input[type="file"]')!, {
      target: { files: [new File(["resume"], "resume.pdf", { type: "application/pdf" })] },
    });
    fireEvent.submit(screen.getByLabelText("Version name").closest("form")!);

    expect((await screen.findByRole("alert")).textContent)
      .toBe("Could not import this CV. Please try again.");
    expect((screen.getByRole("button", { name: "Create version" }) as HTMLButtonElement).disabled)
      .toBe(false);
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("ManualCvForm", () => {
  it("recovers from an unreadable server response instead of leaving CV text pending", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      json: async () => { throw new SyntaxError("invalid JSON"); },
    }));
    render(<ManualCvForm />);

    fireEvent.change(screen.getByLabelText("Version name"), {
      target: { value: "Analytics CV" },
    });
    fireEvent.change(screen.getByLabelText("CV text"), {
      target: { value: "Experienced data scientist with production machine learning skills." },
    });
    fireEvent.submit(screen.getByLabelText("CV text").closest("form")!);

    expect((await screen.findByRole("alert")).textContent)
      .toBe("Could not save CV text. Please try again.");
    expect((screen.getByRole("button", { name: "Save text version" }) as HTMLButtonElement).disabled)
      .toBe(false);
    expect(refresh).not.toHaveBeenCalled();
  });
});
