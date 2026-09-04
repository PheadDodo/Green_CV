// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthForm } from "./auth-form";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));

beforeEach(() => {
  router.push.mockReset();
  router.refresh.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function fillSignInForm() {
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "person@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "a-secure-password" },
  });
  fireEvent.submit(screen.getByLabelText("Email").closest("form")!);
}

describe("AuthForm", () => {
  it("redirects after a successful sign in", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ user: { id: "user-id" } }),
    }));
    render(<AuthForm configured redirectTo="/applications" />);

    fillSignInForm();

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/applications"));
    expect(router.refresh).toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("recovers from a network failure and clears its pending state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private network detail")));
    render(<AuthForm configured />);

    fillSignInForm();

    expect((await screen.findByRole("alert")).textContent).toBe("Authentication failed.");
    await waitFor(() => {
      const submit = screen.getByRole("button", { name: "Sign in" }) as HTMLButtonElement;
      expect(submit.disabled).toBe(false);
    });
    expect(router.push).not.toHaveBeenCalled();
  });

  it("handles a non-JSON error response and clears its pending state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockRejectedValue(new SyntaxError("unexpected HTML response")),
    }));
    render(<AuthForm configured />);

    fillSignInForm();

    expect((await screen.findByRole("alert")).textContent).toBe("Authentication failed.");
    const submit = screen.getByRole("button", { name: "Sign in" }) as HTMLButtonElement;
    await waitFor(() => expect(submit.disabled).toBe(false));
    expect(router.push).not.toHaveBeenCalled();
  });

  it("shows the non-enumerating recovery message without redirecting", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        message: "If that account exists, a recovery link is on its way.",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AuthForm configured />);

    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "person@example.com" },
    });
    fireEvent.submit(screen.getByLabelText("Email").closest("form")!);

    expect(await screen.findByText("If that account exists, a recovery link is on its way."))
      .toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/recover", expect.objectContaining({
      method: "POST",
    }));
    expect(screen.getByRole("button", { name: "Send recovery link" })).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("keeps the local demo entry flow independent of account APIs", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<AuthForm configured={false} redirectTo="/dashboard" />);

    fireEvent.click(screen.getByRole("button", { name: /Enter demo workspace/i }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith("/dashboard");
    expect(router.refresh).toHaveBeenCalled();
  });
});
