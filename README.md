# Pathfinder

Pathfinder is a production-shaped personal job-search intelligence workspace. It
tracks applications, preserves job descriptions and submitted CV versions, shows
response/interview metrics, and produces evidence-constrained CV/role evaluations.

## Run locally

```powershell
npm.cmd install
npm.cmd run dev
```

Open <http://localhost:3000/dashboard>.

No credentials are required for local evaluation: Pathfinder automatically uses a
persistent demo workspace in `.data/jobs-summary.json`. Add the environment values
below to switch to private Supabase accounts and real model evaluations.

## Product surfaces

- `/dashboard` — live metrics, funnel, reminders, activity, and the best next move
- `/applications` — visual stage pipeline with append-only status history
- `/applications/:id` — preserved description, CV attachment, and interaction log
- `/applications/:id/evaluation` — versioned fit evidence, gaps, and safe CV edits
- `/cvs` — immutable PDF, DOCX, Markdown, text, and pasted CV versions
- `/imports` — validated CSV imports and SSRF-safe public job URL previews
- `/settings/automation` — persisted rules, run history, retries, and cancellation

## Production configuration

Copy `.env.example` to `.env.local` and configure:

```text
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=... # scheduled worker only; never public
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.4-mini
CRON_SECRET=...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Create a Supabase project, then apply
`supabase/migrations/202608210001_initial_schema.sql`. The migration creates the
relational model, private `cv-files` bucket, database constraints, atomic workflow
functions, default automation rules, and forced Row Level Security policies. Every
query is additionally scoped by the repository to the authenticated user.

When `OPENAI_API_KEY` is present, evaluations run server-side through the Responses
API with strict JSON Schema output. Model evidence is accepted only when it can be
found verbatim in the selected CV. Without a key, a labeled deterministic evaluator
provides the same workflow for local development.

## End-to-end workflow

1. Add or import a role; its description is preserved as a snapshot.
2. Import or paste an immutable CV version and attach it to the application.
3. Run an evaluation—or let the enabled auto-evaluation rule enqueue it.
4. Review evidence, honest gaps, safe edits, model, prompt version, and prior runs.
5. Record replies, interviews, follow-ups, and stage changes; dashboard metrics update
   from those persisted events.

CSV imports require `title`, `company`, and `description`. Download the template from
the Imports page for supported optional columns.

## Automation

Three persisted rules are enabled by default: evaluate ready roles, create follow-up
reminders, and prepare for interviews. Work uses per-user idempotency keys. Failed
runs retry with exponential backoff up to four attempts; users can disable rules or
cancel runs. `vercel.json` calls `/api/cron/daily` every day and the route requires
`Authorization: Bearer $CRON_SECRET`.

## Verification

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

Tests cover exact dashboard metrics, evidence safety, CSV parsing, URL-import SSRF
protections, CV extraction contracts, automation eligibility/idempotency/retries, and
concurrent local persistence.
