# GreenCV project workflow

## Current priority and ownership

- Focus on local development: implement and verify the requested GreenCV behavior
  on the developer's machine.
- Azure deployment is the final project step and will be performed by the user.
  Do not create Azure resources, configure deployment automation, or deploy the app
  unless the user explicitly changes this instruction. Deployment credentials are
  not a prerequisite for work that can be completed locally.
- The user will implement the LLM evaluation work. Leave evaluator prompts, model
  selection, scoring and grounding rules, benchmark datasets, graders, and regression
  evaluation work to the user unless they explicitly request assistance with them.
  This includes the evaluator and its tests (`src/lib/evaluation.ts` and
  `src/lib/evaluation.test.ts`), evaluation orchestration
  (`src/lib/services/evaluate-application.ts`), and evaluator configuration in
  `.env.example`. If another feature needs a change at this boundary, explain the
  dependency before editing that area.
- A change to the coding assistant's model does not authorize a change to GreenCV's
  application model or the ownership boundaries above.

## Before making changes

1. Check `git status` and inspect relevant existing changes. Preserve user work.
2. Read `README.md`, the relevant product decisions in `NOTES.md`, and any applicable
   nested agent instructions. Follow [domain-documentation guidance](domain.md).
3. Read the originating issue when there is one. Follow the existing
   [GitHub issue-tracker configuration](issue-tracker.md) and
   [triage-label vocabulary](triage-labels.md).
4. Identify the requested behavior, completion criteria, and the smallest relevant
   Matt Pocock skill set. Read the selected skills before acting. Reuse decisions
   and approvals already provided in the conversation; clarify only unresolved
   choices that materially affect the work.
5. Read the relevant installed Next.js documentation under
   `node_modules/next/dist/docs/` before changing Next.js code.

## Matt Pocock skills

Check the installed skills under `~/.codex/skills/engineering`. Announce the skills
being used and why. Use the repository's existing setup; do not restart the setup
interview unless the tracker, labels, or domain layout need to change.

| Task | Skill |
| --- | --- |
| Understand unfamiliar code | `zoom-out` |
| Diagnose a bug or performance regression | `diagnose` |
| Implement behavior or a bug fix | `tdd` |
| Improve architecture or plan refactoring | `improve-codebase-architecture` |
| Define a product specification | `to-prd` |
| Break approved work into issues | `to-issues` |
| Handle issue intake or workflow | `triage` |
| Stress-test a design against domain decisions | `grill-with-docs` |
| Explore a throwaway prototype | `prototype` |

Use small behavior changes and meaningful tests through public interfaces. Delegate
independent tasks when useful, with clear file ownership. Documentation-only edits
need a diff and link check rather than new application tests.

## Local execution and verification

- Use `npm.cmd ci` when dependencies need installing, then `npm.cmd run dev`.
  Open `http://localhost:4000/dashboard`. If the development port changes, align
  `.env.local`'s `NEXT_PUBLIC_APP_URL` and Supabase Auth Site URL/callback URLs,
  then restart the affected local services without resetting data.
- Without Supabase configuration, development uses the local demo workspace.
  `.data/` and `.env.local` stay private and ignored by Git.
- Test each changed behavior at the appropriate scope. Before handing off an
  application-code milestone, run `npm.cmd test`, `npm.cmd run typecheck`,
  `npm.cmd run lint`, and `npm.cmd run build`.
- Verify changed user flows locally when possible. Report which checks actually ran,
  their outcomes, and any remaining limitations. Passing mocked repository tests
  or SQL-text checks does not establish live PostgreSQL, authentication, or Storage
  behavior; report real backend verification separately when performed.
- Report local readiness separately from cloud deployment readiness. Keep Azure
  deployment deferred until the user reaches that final step.
- Keep commits, pushes, and GitHub writes within the user's authorized task scope.
