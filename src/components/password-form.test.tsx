// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PasswordForm } from "./password-form";

afterEach(cleanup);

describe("PasswordForm", () => {
  it("explains that demo mode has no account password instead of showing the form", () => {
    render(<PasswordForm configured={false} />);

    expect(screen.getByText("Password management is available after Supabase accounts are configured."))
      .toBeTruthy();
    expect(screen.queryByLabelText("New password")).toBeNull();
  });
});
