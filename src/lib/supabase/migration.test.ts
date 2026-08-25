import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const userTables = ["jobs", "cv_versions", "applications", "application_events", "evaluations", "reminders", "import_batches", "automation_rules", "automation_runs"];

describe("initial Supabase migration", () => {
  it("forces RLS and creates an owner policy for every user table", async () => {
    const sql = await readFile(path.join(process.cwd(), "supabase", "migrations", "202608210001_initial_schema.sql"), "utf8");
    for (const table of userTables) {
      expect(sql).toContain(`alter table public.${table} force row level security;`);
      expect(sql).toMatch(new RegExp(`create policy [^\\n]+ on public\\.${table}\\s+for all to authenticated\\s+using \\(\\(select auth\\.uid\\(\\)\\) = user_id\\)\\s+with check \\(\\(select auth\\.uid\\(\\)\\) = user_id\\);`));
    }
  });

  it("keeps CV storage private and scopes object paths to the authenticated user", async () => {
    const sql = await readFile(path.join(process.cwd(), "supabase", "migrations", "202608210001_initial_schema.sql"), "utf8");
    expect(sql).toMatch(/'cv-files',\s*'cv-files',\s*false/);
    expect(sql).toContain("(storage.foldername(name))[1] = (select auth.uid())::text");
    expect(sql).toContain("'text/markdown'");
  });
});
