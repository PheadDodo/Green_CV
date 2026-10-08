import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), getDataRepository: vi.fn(), getPublic: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/auth", () => ({ AuthRequiredError: class AuthRequiredError extends Error {}, requireUser: mocks.requireUser }));
vi.mock("@/lib/data", () => ({ getDataRepository: mocks.getDataRepository }));
vi.mock("@/lib/llm/settings", () => ({ getPublicLlmSettings: mocks.getPublic, saveLlmSettings: mocks.save, LlmSettingsValidationError: class LlmSettingsValidationError extends Error {} }));
import { AuthRequiredError } from "@/lib/auth";
import { LlmSettingsValidationError } from "@/lib/llm/settings";
import { GET, PUT } from "./route";
const repository = { userId: "owner" };
const publicSettings = { mode: "api", protocol: "openai", baseUrl: "https://api.openai.com/v1", model: "chosen", hasApiKey: true, updatedAt: null };
beforeEach(() => { vi.clearAllMocks(); mocks.requireUser.mockResolvedValue({ id: "owner" }); mocks.getDataRepository.mockResolvedValue(repository); mocks.getPublic.mockResolvedValue(publicSettings); mocks.save.mockResolvedValue(publicSettings); });
function request(body: unknown) { return new Request("http://localhost/api/settings/llm", { method: "PUT", body: JSON.stringify(body) }); }
describe("owner-scoped LLM settings API", () => {
  it("reads only public settings with caching disabled", async () => {
    const response = await GET();
    expect(mocks.getDataRepository).toHaveBeenCalledWith({ userId: "owner" });
    expect(await response.json()).toEqual({ settings: publicSettings });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it("saves using the authenticated owner rather than a supplied identity", async () => {
    const input = { ...publicSettings, apiKey: "private" };
    const response = await PUT(request(input));
    expect(mocks.save).toHaveBeenCalledWith(repository, input);
    expect(JSON.stringify(await response.json())).not.toContain("private");
  });
  it("rejects unauthenticated requests before accessing storage", async () => {
    mocks.requireUser.mockRejectedValue(new AuthRequiredError());
    expect((await GET()).status).toBe(401);
    expect((await PUT(request({}))).status).toBe(401);
    expect(mocks.getDataRepository).not.toHaveBeenCalled();
  });
  it("maps safe validation errors and redacts internal storage failures", async () => {
    mocks.save.mockRejectedValueOnce(new LlmSettingsValidationError("Enter a model name."));
    const invalid = await PUT(request({}));
    expect(invalid.status).toBe(400); expect(await invalid.json()).toEqual({ error: "Enter a model name." });
    mocks.save.mockRejectedValueOnce(new Error("private-api-key database detail"));
    const failure = await PUT(request({}));
    expect(failure.status).toBe(500); expect(JSON.stringify(await failure.json())).not.toContain("private-api-key");
  });
});
