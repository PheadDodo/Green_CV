// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AddRoleDialog } from "./add-role-dialog";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

afterEach(cleanup);

describe("AddRoleDialog", () => {
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
});
