// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "./app-shell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings/account",
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

afterEach(cleanup);

describe("AppShell", () => {
  it("links account security from the primary navigation", () => {
    render(<AppShell viewer={{ email: "alex@example.com", isDemo: false }}>
      <main>Workspace</main>
    </AppShell>);

    const accountLink = screen.getByRole("link", { name: "Account security" });
    expect(accountLink.getAttribute("href")).toBe("/settings/account");
    expect(accountLink.className).toContain("active");
  });
});
