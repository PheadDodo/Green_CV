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

## CV library artifacts

- Every new upload is validated and converted to canonical Markdown before it is
  saved as the immutable `cv_versions.content` used by evaluation.
- `CV.md` is generated from that private canonical content on download, avoiding a
  duplicate file and keeping local and PostgreSQL-backed environments consistent.
- Original files use opaque private paths. Only authenticated, owner-scoped API
  routes can read them; storage paths never reach the browser.
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
