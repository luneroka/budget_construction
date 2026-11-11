# Instructions for Claude Code

## Read first

Short rule documents, read in full:

- `docs/api/errors.md` — the API error convention.
- `docs/architecture/batibudget_project_summary.md` §6 "Core Business
  Rules" (that section only).
- `docs/planning/ui_consistency_review_2026-09-19.md` — the UI rules.

Long documents, search, do not read in full (Grep for the sections the
task needs):

- `docs/architecture/batibudget_project_summary.md` — the rest: domain
  model, workflows, architecture.
- `docs/architecture/production_deployment_runbook.md` — deployment,
  rollback, disaster recovery, Deployment History.
- `docs/security/security_audit_2026-08-26.md`.

There is no read-only query script for the dev database.

## Team workflow

- `/feature` is required for changes that touch backend logic,
  migrations, auth or permissions, per-user data isolation, the
  financial engine (KPIs and totals), R2 documents, or more than one
  area of the app. It runs product, then Yoann's approval of the spec,
  then dev, then qa, then Yoann's approval of the verdict.
- Everything else, such as UI tweaks, copy or quick experiments, can be
  done directly in a normal session.
- Before merging any branch, whether it went through `/feature` or not,
  run `/preflight` (the pre-merge gate) and ask the qa agent to review
  the full branch diff. Dependabot PRs are the exception: `/deps` runs
  `/preflight` on its batch, with no qa review.
- Specs live in `docs/specs/` (the older screen specs stay in `docs/ui/`).
- `/feature` ends on a local branch: Yoann pushes it and opens the PR,
  which `/ship` then takes by number.
- `/deps`: weekly Dependabot triage. `/ship`: merge a ready PR.
- `/deploy`: production deployment run by Claude over ssh, with Yoann's
  approval at each step.
- The repository is public: no VPS address, ssh detail or secret in a
  tracked file (they live in the gitignored `docs/untracked/`).

Never report a check as passing that you did not run.
