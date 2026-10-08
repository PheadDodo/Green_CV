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

Open <http://localhost:4000/dashboard>. With no environment file, development uses
the persistent demo workspace at `.data/jobs-summary.json` and keeps uploaded CV
files under `.data/cv-files/`. Both are ignored by Git and must not be used as
production storage. The development command binds to `127.0.0.1`, so this shared
demo identity and its private files are not exposed to other devices on your LAN.

GreenCV uses port `4000` for local development because Windows can reserve port
`3000`, causing `listen EACCES` even when no other server is running. If you change
the development port, keep `NEXT_PUBLIC_APP_URL` in `.env.local` and the Supabase
Auth Site URL and callback URLs in sync. For local Supabase, update `[auth]` in
`supabase/config.toml`, then stop and start the stack without resetting its data.

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
- `/applications/:id` — job brief, source description, CV, interaction history, and owner-controlled deletion
- `/applications/:id/evaluation` — versioned fit evidence, gaps, and safe CV edits
- `/cvs` — upload, select or unselect, privately preview, ATS-check, download, or delete CVs
- `/imports` — deletable audit history for CSV batches (up to 100 rows) and SSRF-safe public job URL previews
- `/settings/automation` — editable reminder timing, run history, retries, and safe cancellation
- `/settings/llm` — choose an API or local LLM, set its endpoint/model, and test the saved connection
- `/settings/account` — password and account-security controls

## Choose an LLM provider

Open **LLM settings** in the navigation. Select **LLM API** or **Local LLM**, choose
the API format, enter the base URL and exact model ID, then save. **Test saved
connection** requests only the provider's model list; it does not send CVs, job
descriptions, or generation requests. Model-list access does not guarantee that a
model can generate a valid evaluation, and some providers do not expose a model list.

Supported API formats:

| Format | Example base URL | Use |
| --- | --- | --- |
| OpenAI-compatible | `https://api.openai.com/v1` | OpenAI and compatible cloud chat APIs |
| Claude / Anthropic | `https://api.anthropic.com/v1` | Anthropic Messages API |
| Ollama | `http://127.0.0.1:11434` | Native local Ollama API |
| OpenAI-compatible (local) | `http://127.0.0.1:1234/v1` | LM Studio, llama.cpp, Ollama's `/v1` API, and compatible local servers |

Use the base URL including its API prefix, without the final `chat/completions`,
`messages`, or `api/chat` path. The model must support the selected API format and
produce the required JSON evaluation. Providers with a different protocol need a
new adapter; selecting an arbitrary provider name does not translate its API.

Local servers must run on the same machine as GreenCV and use a loopback address.
This option is available in development mode. A hosted server's localhost is the
hosting machine, so it cannot reach an LLM on your laptop through this setting.
Choose an on-device model: a loopback address identifies the server, but a gateway
or a cloud-backed model can still forward requests to a cloud provider.
Cloud API base URLs must use HTTPS and resolve to public addresses.

Each account owns its settings. API keys are encrypted at rest and are never
returned by the settings API. A blank key keeps the existing key only for the same
provider and endpoint; changing that target requires a new key. Local model keys
are optional. Selecting **Server default** restores the existing
`OPENAI_API_KEY` / `OPENAI_MODEL` behavior, or the deterministic evaluator if no
server key is configured. Explicit provider errors never switch to another model.
Saved API settings may incur charges even when the server's OpenAI key is blank;
set `MAX_EVALUATIONS_PER_DAY=0` to disable paid API evaluations. Local and demo
evaluations do not consume that API allowance.

For Supabase-backed settings, apply the new checked-in LLM settings migration
using the project's existing migration workflow. Set the server-only
`LLM_SETTINGS_ENCRYPTION_KEY` to 32 random bytes encoded as base64 before saving
keys. Generate it once from the project directory:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Keep this key stable and include it in private backups; replacing it makes saved
API keys unreadable. Local JSON development automatically creates an ignored key
beside the data file and stores encrypted settings in a separate ignored file.
Back up those files together when moving your private workspace. Existing
evaluation results are retained; provider, endpoint, and model changes prevent
reuse of a result from a different configuration. Prompt and scoring rules remain
the evaluator's existing rules.

## Configure local PostgreSQL and accounts

Local development is the current priority; cloud deployment is a separate, later
step. Supabase runs PostgreSQL, authentication, and private file storage on your
machine through Docker. Open Docker Desktop and wait for its **Linux engine** to
be running. The pinned Supabase CLI is already a project dependency installed by
`npm.cmd ci`; no global CLI installation is needed.
See the [Supabase local development guide](https://supabase.com/docs/guides/local-development)
and [CLI setup guide](https://supabase.com/docs/guides/local-development/cli/getting-started).

From the project folder, create a dedicated network with the requested loopback
binding **once**:

```powershell
$env:SUPABASE_TELEMETRY_DISABLED = '1'
docker network create -o 'com.docker.network.bridge.host_binding_ipv4=127.0.0.1' greencv-local
```

Start the local stack using that same network on each subsequent session:

```powershell
$env:SUPABASE_TELEMETRY_DISABLED = '1'
npx.cmd supabase start --network-id greencv-local
```

The first startup downloads container images and can take several minutes. The
network option follows [Supabase's local network guidance](https://supabase.com/docs/guides/local-development),
but it is **not sufficient proof of localhost-only access on Docker Desktop**.
In our Windows check, Docker still published ports on all interfaces despite
that option. Do not expose this local stack publicly.
This repository already contains `supabase/config.toml` and its migrations, so do
not run `supabase init`, `login`, `link`, cloud `db push`, or `db reset` for this
setup. The initial local startup applies the checked-in migrations.

Before configuring GreenCV, creating accounts, or uploading any CVs, inspect the
actual published bindings after startup:

```powershell
docker ps --filter 'name=supabase_' --format 'table {{.Names}}\t{{.Ports}}'
```

Every host-side mapping must use `127.0.0.1` or `[::1]`. Bare container ports with
no `->` are not published. No container rows means the stack is stopped or missing,
not that the privacy check passed. If you see `0.0.0.0`, `[::]`, or another
non-loopback host address, stop here and preserve the data while stopping the stack:

```powershell
$env:SUPABASE_TELEMETRY_DISABLED = '1'
npx.cmd supabase stop
```

Do not continue until bindings have been corrected and checked again. A
`localhost` URL in startup output does not establish that a port is private.

On Docker Desktop, one option is to open **Settings**, find **Port binding
behavior** in the network settings, and choose **Localhost by default**. This is
a **Docker-wide default**, not a GreenCV-only setting, so make that change yourself
only if its effect on other projects is acceptable. Apply the setting, restart
the local stack, and repeat the binding check. See [Docker's networking guidance](https://docs.docker.com/desktop/features/networking/#how-exposed-ports-work)
and [port-binding setting reference](https://docs.docker.com/enterprise/security/hardened-desktop/settings-management/settings-reference/#port-binding-behavior).
If the option is unavailable or results remain unclear, keep the stack stopped
and investigate before adding private data; no Docker-wide setting is changed by
the commands in this guide.

Once startup and the binding check pass, these are the local service addresses:

| Service | Address |
| --- | --- |
| Studio: database, accounts, and storage UI | <http://127.0.0.1:54323> |
| API used by GreenCV | <http://127.0.0.1:54321> |
| PostgreSQL connection host and port | `127.0.0.1:54322` |

Get the **local publishable key** from the startup output or:

```powershell
$env:SUPABASE_TELEMETRY_DISABLED = '1'
npx.cmd supabase status
```

Status output also contains secrets: do not share screenshots, paste the output
into issues, or commit it. Create the ignored `.env.local` file if it does not
exist, or update only these entries in an existing file. Replace the key
placeholder with the local publishable key, never a secret/service-role key:

```text
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_LOCAL_PUBLISHABLE_KEY
NEXT_PUBLIC_APP_URL=http://localhost:4000
OPENAI_API_KEY=
MAX_EVALUATIONS_PER_DAY=0
```

Account, application, and CV testing does not require `SUPABASE_SECRET_KEY` or a
cron secret. Keep the OpenAI key blank and the paid-evaluation limit at zero for
no-cost local testing: attaching a CV can trigger automatic evaluation without
clicking the Evaluate button. This does not change the user-owned evaluator.

Restart the app with inherited paid-evaluation credentials cleared for this session:

```powershell
$env:OPENAI_API_KEY = ''
$env:MAX_EVALUATIONS_PER_DAY = '0'
npm.cmd run dev
```

Open <http://localhost:4000/login> and create a fictional local test account. Real
accounts start with their own empty workspace; existing demo records in `.data/`
are neither migrated nor deleted. Use a second fictional account to check that
applications and private CV artifacts remain isolated between accounts. This is
separate from `npm.cmd run test:e2e`, which intentionally tests JSON demo storage.

When finished, stop the app with `Ctrl+C`, then stop Supabase without resetting
its data:

```powershell
$env:SUPABASE_TELEMETRY_DISABLED = '1'
npx.cmd supabase stop
```

Restart with `supabase start --network-id greencv-local` through `npx.cmd` next
time. Do not add `--no-backup`, run `db reset`, or remove Docker volumes unless
you intentionally want to discard local data. Normal stop preserves the database;
see [the CLI stopping and telemetry guidance](https://supabase.com/docs/guides/local-development/cli/getting-started).

## Continue on another desktop

GitHub transfers the source code and database migrations, not `.env.local`, local
accounts, application records, uploaded CVs, or Docker volumes. Keep the private
transfer package separate from GitHub and transfer it through a trusted private
channel; it contains sensitive data and must never be committed.

1. Install Git, Node.js 22.13 or newer (Node.js 24 matches CI), and Docker Desktop.
   Clone the repository and install its pinned dependencies:

   ```powershell
   git clone https://github.com/PheadDodo/Green_CV.git
   cd Green_CV
   npm.cmd ci
   ```

2. Start Docker Desktop's Linux engine. Follow the loopback-only network and
   port-binding guidance in [Configure local PostgreSQL and accounts](#configure-local-postgresql-and-accounts).
   **Do not start Supabase yet if restoring existing data.**
3. Follow `RESTORE.md` inside the private transfer package. Restore only into
   verified empty destination volumes, using the recorded compatible service
   versions, before the first Supabase startup. Never overwrite an existing
   database or use `db reset` as a restore step.
4. After restoration, start Supabase and verify its private port bindings as
   described above. Recreate the ignored `.env.local` with this desktop's local
   API URL and publishable key, `NEXT_PUBLIC_APP_URL=http://localhost:4000`, a blank
   `OPENAI_API_KEY`, and `MAX_EVALUATIONS_PER_DAY=0`. Do not assume old local keys
   still apply or publish status output containing secrets.
5. Run `npm.cmd run dev` and open <http://localhost:4000/login>. Check sign-in,
   existing applications, PDF preview, and CV Markdown download. Keep the old
   desktop's volumes and private backup until these checks pass.

The project's workflow documentation travels with Git, but installed Matt Pocock
engineering skills do not. Install those skills separately on the new desktop
and follow [the project workflow](docs/agents/workflow.md). LLM evaluation and
Azure deployment remain user-owned, deferred work.

## Configure hosted PostgreSQL and accounts (optional, later)

This hosted setup is not required for the local workflow above.

Use a dedicated Supabase project. Copy `.env.example` to `.env.local`, then get the
Project URL, publishable key, and secret key from the project's API Keys page:

```text
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
NEXT_PUBLIC_APP_URL=http://localhost:4000
```

The publishable key is safe for the browser. The secret key bypasses Row Level
Security and must exist only in local/deployment environment settings—never in Git
and never in a variable beginning with `NEXT_PUBLIC_`.

Apply the checked-in PostgreSQL migrations:

```powershell
npx.cmd supabase login
npx.cmd supabase link --project-ref YOUR_PROJECT_REF
npx.cmd supabase db push --dry-run
npx.cmd supabase db push
```

The migrations create nine user-owned tables, constraints, workflow functions,
forced Row Level Security policies, default automation rules, and the private
`cv-files` Storage bucket. CV objects use opaque owner-scoped paths and share the
application's 4 MB upload limit.

In Supabase Authentication → URL Configuration, set:

```text
Site URL:      http://localhost:4000
Redirect URL: http://localhost:4000/auth/callback
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

### Local browser tests

Install the test browser once after installing npm dependencies:

```powershell
npx.cmd playwright install chromium
```

Run the browser checks without starting a server yourself:

```powershell
npm.cmd run test:e2e
```

Playwright starts a separate loopback-only development server on port `3100` and
stops it afterward. The port must be free: tests deliberately refuse to reuse an
existing server. Every run creates its own ignored `.data/e2e/run-*` directory for
fictional records and CV files, leaving the normal demo workspace untouched. These
small test directories remain for inspection; screenshots, traces, and the HTML
report also stay ignored. Supabase and OpenAI credentials are blanked for the test
server even if they are configured in your environment files.

The checks exercise the actual browser, app routes, and local file storage:

- Create an application, progress through Applied → Interview → Offer, reload,
  verify current-status and funnel counts, then delete the test application.
- Upload a fictional PDF, verify the document supplied to the preview window,
  inspect ATS section detection, and download Markdown with preserved headings
  and word spacing.
- Select and unselect a CV, verify future defaults and existing attachments,
  cancel then confirm deletion, and verify deleted artifacts are unavailable.

These are local development checks, not PostgreSQL/authentication, LLM, Azure,
server-restart persistence, or native PDF-viewer visual tests. Run them separately
from builds/type generation: Next.js still regenerates the ignored `next-env.d.ts`
even though browser tests use their own build cache and TypeScript configuration.
The existing GitHub Actions checks remain unchanged; browser tests are run locally.
