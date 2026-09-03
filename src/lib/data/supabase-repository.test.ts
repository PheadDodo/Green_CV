import { describe, expect, it, vi } from "vitest";
import { SupabaseDataRepository } from "./supabase-repository";

describe("SupabaseDataRepository reminders", () => {
  it("returns an existing dismissal on retry without rewriting reminder history", async () => {
    const updateQuery = fluentQuery({ data: null, error: null });
    const dismissedRow = {
      id: "10000000-0000-4000-8000-000000000001",
      user_id: "owner-id",
      application_id: null,
      title: "Follow up",
      notes: null,
      due_at: "2026-09-03T09:00:00.000Z",
      status: "dismissed" as const,
      completed_at: null,
      created_at: "2026-09-01T09:00:00.000Z",
      updated_at: "2026-09-02T09:00:00.000Z",
    };
    const lookupQuery = fluentQuery({ data: dismissedRow, error: null });
    const from = vi.fn()
      .mockReturnValueOnce(updateQuery)
      .mockReturnValueOnce(lookupQuery);
    const repository = new SupabaseDataRepository({ from } as never, "owner-id");

    const reminder = await repository.dismissReminder(dismissedRow.id);

    expect(reminder.status).toBe("dismissed");
    expect(reminder.updatedAt).toBe(dismissedRow.updated_at);
    expect(updateQuery.update).toHaveBeenCalledWith({ status: "dismissed", completed_at: null });
    expect(updateQuery.eq).toHaveBeenCalledWith("status", "pending");
    expect(lookupQuery.eq).toHaveBeenCalledWith("user_id", "owner-id");
    expect(lookupQuery.eq).toHaveBeenCalledWith("status", "dismissed");
  });
});

function fluentQuery(result: { data: unknown; error: unknown }) {
  const query = {
    update: vi.fn(),
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  query.update.mockReturnValue(query);
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}
