// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Logo } from "./logo";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

describe("Logo", () => {
  afterEach(cleanup);

  it("presents the product as GreenCV", () => {
    render(<Logo />);

    expect(screen.getByRole("link", { name: "GreenCV dashboard" })).toBeTruthy();
    expect(screen.getByText("GreenCV")).toBeTruthy();
    expect(screen.getByText("G")).toBeTruthy();
  });
});
