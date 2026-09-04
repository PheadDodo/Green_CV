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

describe("CV artifact storage hardening migration", () => {
  it("matches the application upload limit and only accepts opaque artifact paths", async () => {
    const sql = await readFile(
      path.join(process.cwd(), "supabase", "migrations", "20260826000100_harden_cv_artifacts.sql"),
      "utf8",
    );

    expect(sql).toContain("file_size_limit = 4194304");
    expect(sql).toContain("cardinality(storage.foldername(name)) = 2");
    expect(sql).toContain("cardinality(storage.foldername(name)) = 1");
    expect(sql).toContain("storage.filename(name) in ('original.pdf', 'original.docx', 'original.md', 'original.txt')");
    expect(sql).toContain("split_part(storage_path, '/', 1) = user_id::text");
    expect(sql).toContain('drop policy if exists "Users update their own CV files"');
    expect(sql).not.toContain('create policy "Users update their own CV files"');
  });
});

describe("CV selection migration", () => {
  it("selects the first CV for each user without promoting later replacements", async () => {
    const sql = await readFile(
      path.join(process.cwd(), "supabase", "migrations", "20260826000200_cv_selection.sql"),
      "utf8",
    );

    expect(sql).toContain("partition by user_id");
    expect(sql).toContain("if tg_op = 'INSERT'");
    expect(sql).toContain("not exists (");
    expect(sql).toContain("from public.cv_versions as existing");
    expect(sql).toContain("existing.user_id = new.user_id");
  });
});

describe("atomic imported application migration", () => {
  it("creates the imported application aggregate and audit event in one owner-scoped RPC", async () => {
    const sql = await readFile(
      path.join(
        process.cwd(),
        "supabase",
        "migrations",
        "20260904000100_create_imported_application.sql",
      ),
      "utf8",
    );

    expect(sql).toContain("create function public.create_imported_application(");
    expect(sql).toContain("v_user_id uuid := auth.uid()");
    expect(sql).toMatch(/from public\.import_batches\s+where id = p_batch_id and user_id = v_user_id/);
    expect(sql).toContain("insert into public.jobs");
    expect(sql).toContain("insert into public.applications");
    expect(sql).toContain("insert into public.application_events");
    expect(sql).toContain("'imported'");
    expect(sql).toContain("jsonb_build_object('batchId', p_batch_id)");
    expect(sql).toContain("return jsonb_build_object(");
    expect(sql).toContain("security invoker");
    expect(sql).toContain("set search_path = public, pg_temp");
    expect(sql).toContain("revoke all on function public.create_imported_application(jsonb, jsonb, uuid)");
    expect(sql).toContain("grant execute on function public.create_imported_application(jsonb, jsonb, uuid) to authenticated");
  });
});
