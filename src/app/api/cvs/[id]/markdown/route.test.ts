import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getDataRepository: vi.fn(),
  getCvVersion: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  AuthRequiredError: class AuthRequiredError extends Error {},
  requireUser: mocks.requireUser,
}));
vi.mock("@/lib/data", () => ({ getDataRepository: mocks.getDataRepository }));

import { GET } from "./route";

const CV_ID = "10000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "owner-id" });
  mocks.getDataRepository.mockResolvedValue({ getCvVersion: mocks.getCvVersion });
});

describe("GET /api/cvs/[id]/markdown", () => {
  it("serves only the owner-scoped CV content as CV.md", async () => {
    mocks.getCvVersion.mockResolvedValue({ content: "# Canonical CV\n" });

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: CV_ID }),
    });

    expect(mocks.getDataRepository).toHaveBeenCalledWith({ userId: "owner-id" });
    expect(mocks.getCvVersion).toHaveBeenCalledWith(CV_ID);
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="CV.md"');
    expect(await response.text()).toBe("# Canonical CV\n");
  });

  it("returns the same 404 for an absent or non-owned CV", async () => {
    mocks.getCvVersion.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: CV_ID }),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "CV version not found." });
  });
});
