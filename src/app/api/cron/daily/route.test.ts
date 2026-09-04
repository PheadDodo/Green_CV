import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyCronAuthorization: vi.fn(),
  getDataRepository: vi.fn(),
  isSupabaseConfigured: vi.fn(),
  runAutomations: vi.fn(),
}));

vi.mock("@/lib/cron-auth", () => ({
  verifyCronAuthorization: mocks.verifyCronAuthorization,
}));
vi.mock("@/lib/data", () => ({ getDataRepository: mocks.getDataRepository }));
vi.mock("@/lib/supabase/env", () => ({
  isSupabaseConfigured: mocks.isSupabaseConfigured,
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("@/lib/services/run-automations", () => ({ runAutomations: mocks.runAutomations }));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyCronAuthorization.mockReturnValue("authorized");
  mocks.isSupabaseConfigured.mockReturnValue(false);
  mocks.getDataRepository.mockResolvedValue({ repository: true });
  mocks.runAutomations.mockResolvedValue({ succeeded: 1 });
});

describe("GET /api/cron/daily", () => {
  it("runs the local scheduled workspace when authorized", async () => {
    const response = await GET(new Request("http://localhost/api/cron/daily"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ users: 1 });
  });

  it("does not expose worker or repository failures", async () => {
    mocks.runAutomations.mockRejectedValueOnce(new Error("private database detail"));
    const response = await GET(new Request("http://localhost/api/cron/daily"));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Scheduled automation failed." });
  });
});
