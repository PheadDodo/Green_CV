# Product decision record

## Decision

The prototype converged on a hybrid information architecture:

- Design A became `/dashboard`: metrics, funnel, current-status chart, activity,
  and the best next move.
- Design B became `/applications`: the visual application pipeline.
- Design C became `/applications/:id/evaluation`: evidence-first CV/role analysis.

All three use the same green visual system and real repository data. The floating
prototype switcher and the three static variants were removed after the decision.

## Product boundary

GreenCV is a personal job-search intelligence workspace, not a scraper or a
generic CRM. It preserves what happened and uses the selected CV plus the preserved
job description to explain why a role is worth pursuing. Suggestions may emphasize
existing evidence but never invent experience.

Preservation means retained job and CV evidence is immutable in place and events are
append-only. Owner-initiated deletion remains available as a privacy operation.

## Metric definitions

- Active applications: current status is Applied, Screening, or Interview.
- Response rate: submitted applications with a recorded human response divided by
  applications submitted in the selected cohort.
- Interviews: distinct applications reaching Interview in the selected period.
- Average fit: latest successful evaluation for each active application.
- Funnel: distinct applications reaching each stage in the selected period.
- Current status chart: each application is counted once by its status now;
  Rejected, Withdrawn, and Archived are grouped as Closed.

These definitions live in tested domain code, not in presentation components.

## Reminder workflow

- The dashboard shows the first three pending reminders in due-date order. Resolving
  one immediately reveals the next reminder and refreshes server data.
- A reminder linked to an application provides a direct application link. Unlinked
  reminders remain actionable without exposing an invalid destination.
- Completing and dismissing are authenticated, owner-scoped status transitions.
  Both leave the reminder record available for history; completion records a time,
  while dismissal leaves `completedAt` empty. The first terminal transition wins;
  retrying the same action is idempotent and cannot rewrite its timestamp.
- Overdue reminders are calculated from a server-provided timestamp so the initial
  client render is stable. Due labels include UTC explicitly to prevent server and
  browser hydration drift. Failed actions keep the reminder visible and reusable.
- PostgreSQL already supports the `dismissed` status, update permissions, and Row
  Level Security, so this workflow requires no schema migration.

## CV library artifacts

- Every new upload is validated and converted to canonical Markdown before it is
  saved as the immutable `cv_versions.content` used by evaluation.
- PDF imports reconstruct word separators from text positioning before Markdown
  conversion. Recognized section labels keep their readable source wording while
  ATS checks map aliases such as Core Skills to standard semantic categories.
- `CV.md` is generated from that private canonical content on download, avoiding a
  duplicate file and keeping local and PostgreSQL-backed environments consistent.
- Original files use opaque private paths. Only authenticated, owner-scoped API
  routes can read them; storage paths never reach the browser.
- Local demo storage creates CV files and their artifact directories with
  owner-only permissions on platforms that support POSIX permission bits.
- PDF previews use a short-lived browser Blob URL. ATS scans are deterministic
  compatibility guidance and do not claim to reproduce an employer's ATS score.
- The first CV is selected automatically. Selecting another makes it the default
  choice in new-application and unattached-role CV pickers; it never rewrites an
  existing attachment.
- Unselecting the default leaves no CV selected and does not promote another
  version. Future CV pickers stay blank until a CV is selected again.
- Deleting a CV first removes its private original file, then deletes its canonical
  content and detaches it from applications and evaluations. Historical evaluation
  results, including quoted CV evidence, and application activity remain as an
  audit trail; deleting the selected CV does not silently promote another version.

## Application privacy

- Owners can permanently delete an application from its detail page after an
  explicit confirmation naming the role and company.
- Deletion removes the application, its preserved job, timeline, reminders, and
  evaluation history. Automation run audit entries remain without an application
  reference, and CV versions remain reusable.
- Missing and foreign-owned identifiers return the same not-found response so the
  endpoint does not disclose whether another account owns a record.

## Import provenance

- CSV preview and commit share a 100-row synchronous limit so production storage
  cannot accidentally execute thousands of sequential writes in one request.
- The original filename, original CSV row numbers, validation failures, and later
  persistence failures remain attached to the import batch.
- Public URL imports use the same auditable batch lifecycle as CSV imports. Users
  review extracted title, company, location, workplace, employment type, and full
  description before saving.
- Stored listing links must use HTTP or HTTPS, including on tampered commit requests.
- Deleting an import batch removes only its provenance and row-level error details;
  applications already created from that batch remain in the pipeline.

## Reminder automation reliability

- Follow-up timing is stored canonically in hours and edited in whole days;
  interview-preparation timing is edited and stored in hours.
- Only pending or retryable failed reminder runs can be cancelled. Running,
  completed, exhausted, and evaluation runs cannot be cancelled from this screen.
- A due reminder run is claimed atomically before work starts. Its run identifier is
  also the reminder identifier, so concurrent workers converge on one reminder.
- Completed or dismissed reminders are never reopened by automation replay.
- Browser-local interview times are converted to absolute ISO instants before they
  reach the server, so reminder timing does not depend on the deployment region.

## Demo account behavior

- Local demo mode has no authentication account and therefore no password to
  update. The account page explains this instead of reporting a false success.
- Configuring Supabase enables the real password form and owner-scoped account data.
