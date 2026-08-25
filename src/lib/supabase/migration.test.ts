import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const userTables = ["jobs", "cv_versions", "applications", "application_events", "evaluations", "reminders", "import_batches", "automation_rules", "automation_runs"];

describe("initial Supabase migration", () => {
  it("forces RLS and creates an owner policy for every user table", async () => {
    const sql = await readFile(path.join(process.cwd(), "supabase", "migrations", "20260821000100_initial_schema.sql"), "utf8");
    for (const table of userTables) {
      expect(sql).toContain(`alter table public.${table} force row level security;`);
      expect(sql).toMatch(new RegExp(`create policy [^\\n]+ on public\\.${table}\\s+for all to authenticated\\s+using \\(\\(select auth\\.uid\\(\\)\\) = user_id\\)\\s+with check \\(\\(select auth\\.uid\\(\\)\\) = user_id\\);`));
    }
  });

  it("keeps CV storage private and scopes object paths to the authenticated user", async () => {
    const sql = await readFile(path.join(process.cwd(), "supabase", "migrations", "20260821000100_initial_schema.sql"), "utf8");
    expect(sql).toMatch(/'cv-files',\s*'cv-files',\s*false/);
    expect(sql).toContain("(storage.foldername(name))[1] = (select auth.uid())::text");
    expect(sql).toContain("'text/markdown'");
  });

  it("keeps captured evidence immutable and application history append-only", async () => {
    const sql = await readFile(path.join(process.cwd(), "supabase", "migrations", "20260821000100_initial_schema.sql"), "utf8");

    expect(sql).toMatch(/grant select, insert, delete on\s+public\.jobs,\s+public\.cv_versions\s+to authenticated;/);
    expect(sql).toContain("grant update (name, is_default) on public.cv_versions to authenticated;");
    expect(sql).toContain("grant select, insert on public.application_events to authenticated;");
    expect(sql).not.toMatch(/grant select, insert, update, delete on\s+public\.jobs/);
    expect(sql).not.toContain('create policy "Users update their own CV files"');
  });
});
