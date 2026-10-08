import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), repository: vi.fn(), resolve: vi.fn(), test: vi.fn() }));
vi.mock("@/lib/auth", () => ({ AuthRequiredError: class AuthRequiredError extends Error {}, requireUser: mocks.requireUser }));
vi.mock("@/lib/data", () => ({ getDataRepository: mocks.repository }));
vi.mock("@/lib/llm/settings", () => ({ resolveLlmConfig: mocks.resolve, LlmSettingsValidationError: class LlmSettingsValidationError extends Error {} }));
vi.mock("@/lib/llm/connection", () => ({ testLlmConnection: mocks.test }));
vi.mock("@/lib/llm/http", () => ({ LlmHttpError: class LlmHttpError extends Error {} }));
import { AuthRequiredError } from "@/lib/auth";
import { POST } from "./route";
beforeEach(() => { vi.clearAllMocks(); mocks.requireUser.mockResolvedValue({ id: "owner" }); mocks.repository.mockResolvedValue({ userId: "owner" }); mocks.resolve.mockResolvedValue({ model: "saved-model" }); mocks.test.mockResolvedValue({ message: "Connected." }); });
describe("LLM connection API", () => {
  it("tests only the saved owner configuration", async () => {
    expect((await POST()).status).toBe(200);
    expect(mocks.repository).toHaveBeenCalledWith({ userId: "owner" });
    expect(mocks.test).toHaveBeenCalledWith({ model: "saved-model" });
  });
  it("rejects unauthenticated tests and hides provider failures", async () => {
    mocks.requireUser.mockRejectedValueOnce(new AuthRequiredError());
    expect((await POST()).status).toBe(401); expect(mocks.test).not.toHaveBeenCalled();
    mocks.test.mockRejectedValueOnce(new Error("Authorization private-api-key"));
    const failed = await POST();
    expect(failed.status).toBe(502); expect(JSON.stringify(await failed.json())).not.toContain("private-api-key");
  });
});
