# Domain documentation

GreenCV uses a single-context domain-documentation layout.

## Before exploring

- Read `CONTEXT.md` at the repository root when it exists.
- Read relevant architecture decisions under `docs/adr/` when that directory exists.
- If either location is absent, continue without proposing placeholder documentation. Create domain documentation only when actual terminology or architecture decisions need to be recorded.

## Vocabulary

Use canonical terms from `CONTEXT.md` in issue titles, test names, implementation plans, and code. If a required concept is not defined, first check whether existing product language already covers it; otherwise record the terminology gap for a domain-documentation session.

## Architecture decisions

Surface any conflict with an existing ADR explicitly. Do not silently override a recorded decision.
