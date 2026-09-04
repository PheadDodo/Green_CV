// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AddRoleDialog } from "./add-role-dialog";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AddRoleDialog", () => {
  it("offers temporary and unspecified employment types", () => {
    render(<AddRoleDialog />);

    fireEvent.click(screen.getByRole("button", { name: "Add role" }));

    const employment = screen.getByLabelText("Employment") as HTMLSelectElement;
    expect(Array.from(employment.options, option => option.value)).toEqual([
      "full_time",
      "part_time",
      "contract",
      "internship",
      "temporary",
      "unspecified",
    ]);
  });

  it("preselects the selected CV for a new application", () => {
    render(<AddRoleDialog cvs={[
      { id: "cv-1", name: "General CV", isDefault: false },
      { id: "cv-2", name: "ML CV", isDefault: true },
    ]} />);

    fireEvent.click(screen.getByRole("button", { name: "Add role" }));

    expect((screen.getByLabelText("Attach CV version") as HTMLSelectElement).value).toBe("cv-2");
  });

  it("defaults to attaching later when no CV is selected", () => {
    render(<AddRoleDialog cvs={[
      { id: "cv-1", name: "General CV", isDefault: false },
      { id: "cv-2", name: "ML CV", isDefault: false },
    ]} />);

    fireEvent.click(screen.getByRole("button", { name: "Add role" }));

    const cvPicker = screen.getByLabelText("Attach CV version") as HTMLSelectElement;
    expect(cvPicker.value).toBe("");
    expect(cvPicker.selectedOptions[0]?.textContent).toBe("Attach later");
  });

  it("recovers from a network failure instead of leaving the role form busy", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<AddRoleDialog />);

    fireEvent.click(screen.getByRole("button", { name: "Add role" }));
    fireEvent.submit(screen.getByRole("form", { name: "Add a job application" }));

    expect((await screen.findByRole("alert")).textContent)
      .toBe("Could not save this role. Please try again.");
    expect((screen.getByRole("button", { name: "Save role" }) as HTMLButtonElement).disabled)
      .toBe(false);
  });
});
