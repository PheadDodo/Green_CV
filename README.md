# GreenCV

GreenCV is a private job-search intelligence workspace. It turns preserved job
descriptions into evidence-only role briefs, tracks applications and interactions,
stores immutable CV versions, and evaluates CV fit without inventing experience.
For retained records, immutable means evidence is never edited in place; owners can
still explicitly delete their own records and private files.

## Run locally

Requires Node.js 22.13 or newer.

```powershell
npm.cmd ci
npm.cmd run dev
```

Open <http://localhost:3000/dashboard>. With no environment file, development uses
the persistent demo workspace at `.data/jobs-summary.json` and keeps uploaded CV
files under `.data/cv-files/`. Both are ignored by Git and must not be used as
production storage. The development command binds to `127.0.0.1`, so this shared
demo identity and its private files are not exposed to other devices on your LAN.

## Product workflow

1. Add a role manually, from a public URL, or with a validated CSV import.
2. Read the structured job brief, then expand the preserved source description.
3. Import or paste an immutable CV version, preview private PDFs, run the ATS
   compatibility scan, download its canonical `CV.md`, and select or unselect the
   default CV used for future application choices.
4. Run an evidence-constrained fit evaluation and review honest gaps and safe edits.
5. Record replies, interviews, follow-ups, and stage changes. Open a reminder's
   application, then complete or dismiss the reminder directly from the dashboard.
   Closed roles remain searchable and can be reopened if a status was changed
   accidentally.

Main routes:

- `/dashboard` — metrics, charts, actionable reminders, activity, and next actions
- `/applications` — searchable open and closed application pipeline
- `/applications/:id` — job brief, source description, CV, and interaction history
- `/applications/:id/evaluation` — versioned fit evidence, gaps, and safe CV edits
- `/cvs` — upload, select or unselect, privately preview, ATS-check, download, or delete CVs
- `/imports` — CSV import and SSRF-safe public job URL previews
- `/settings/automation` — persisted rules, run history, retries, and cancellation

## Configure PostgreSQL and accounts

Use a dedicated Supabase project. Copy `.env.example` to `.env.local`, then get the
Project URL, publishable key, and secret key from the project's API Keys page:

```text
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

The publishable key is safe for the browser. The secret key bypasses Row Level
Security and must exist only in local/deployment environment settings—never in Git
and never in a variable beginning with `NEXT_PUBLIC_`.

Apply the checked-in PostgreSQL migration:

```powershell
npx.cmd supabase login
npx.cmd supabase link --project-ref YOUR_PROJECT_REF
npx.cmd supabase db push --dry-run
npx.cmd supabase db push
```

The migration creates nine user-owned tables, constraints, workflow functions,
forced Row Level Security policies, default automation rules, and the private
`cv-files` Storage bucket. CV objects use opaque owner-scoped paths and share the
application's 4 MB upload limit.

In Supabase Authentication → URL Configuration, set:

```text
Site URL:      http://localhost:3000
Redirect URL: http://localhost:3000/auth/callback
```

Replace both origins with the final HTTPS deployment URL when deploying.

## Deploy on Vercel

1. Import the `PheadDodo/Green_CV` GitHub repository into Vercel.
2. Add the production environment variables from `.env.example`.
3. Set `NEXT_PUBLIC_APP_URL` to the exact Vercel production origin.
4. Add that origin and `/auth/callback` URL in Supabase Auth configuration.
5. Deploy, create/sign in to an account, then test role import, CV upload, evaluation,
   a status change, password recovery, and automation.

Production always requires Supabase. Local JSON demo storage is intentionally
development-only because serverless files are read-only or non-durable.

For a personal deployment, keep registration private:

```text
ALLOW_PUBLIC_SIGNUP=false
AUTHORIZED_EMAILS=your-login-email@example.com
```

For a private launch, two Supabase controls are required: keep email confirmation
enabled, then create/confirm the owner in Authentication → Users and disable
new-user signups in Supabase. `AUTHORIZED_EMAILS` is still enforced by every app API
if an account is created directly, but disabling provider signups also prevents
unapproved accounts from consuming database and Storage quota.

Keep `ALLOW_PUBLIC_SIGNUP=false` while PDF/DOCX parsing runs in the web process.
The 4 MB upload limit and DOCX archive caps reduce risk, but parser CPU and memory
must be isolated in a worker before accepting files from untrusted public accounts.
If `OPENAI_API_KEY` is present, the app applies a per-user, per-UTC-day evaluation
guardrail through `MAX_EVALUATIONS_PER_DAY`
(default `20`). It is suitable for a trusted personal workspace, not a billing-grade
rate limiter for anonymous public access. Without the key,
the deterministic evaluator keeps the complete workflow usable without API cost.

Generate a unique cron secret of at least 32 characters:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Store the output as `CRON_SECRET`. `vercel.json` invokes `/api/cron/daily` at 08:00
UTC; the route rejects missing, short, or published example secrets. The Supabase
secret key is used only by this scheduled server worker.

## Verification

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

GitHub Actions runs the same checks on every push and pull request. Tests cover job
brief extraction, closed-role lifecycle behavior, dashboard metrics, CV evidence
safety, imports, URL SSRF protection, CV extraction, automation lifecycle,
artifact access, ATS compatibility, reminder ownership and actions, configuration
safety, and concurrent local persistence.
