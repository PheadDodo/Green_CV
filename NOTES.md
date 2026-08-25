# Product decision record

## Decision

The prototype converged on a hybrid information architecture:

- Design A became `/dashboard`: metrics, funnel, activity, and the best next move.
- Design B became `/applications`: the visual application pipeline.
- Design C became `/applications/:id/evaluation`: evidence-first CV/role analysis.

All three use the same green visual system and real repository data. The floating
prototype switcher and the three static variants were removed after the decision.

## Product boundary

Pathfinder is a personal job-search intelligence workspace, not a scraper or a
generic CRM. It preserves what happened and uses the selected CV plus the preserved
job description to explain why a role is worth pursuing. Suggestions may emphasize
existing evidence but never invent experience.

## Metric definitions

- Active applications: current status is Applied, Screening, or Interview.
- Response rate: submitted applications with a recorded human response divided by
  applications submitted in the selected cohort.
- Interviews: distinct applications reaching Interview in the selected period.
- Average fit: latest successful evaluation for each active application.
- Funnel: distinct applications reaching each stage in the selected period.

These definitions live in tested domain code, not in presentation components.
