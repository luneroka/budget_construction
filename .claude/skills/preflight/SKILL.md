---
name: preflight
description: The pre-merge gate for budget_construction - one ordered checklist (Ruff, backend suite on its own throwaway database, frontend type check, lint, format, unit tests, build), the same commands CI runs, limited to the backend and frontend checks the change can affect unless given full, that stops at the first failure and ends with a table of each check, its command and its result.
---

# /preflight — the pre-merge gate

Run before any merge, whether the change went through `/feature` or not.
CI runs every workflow on every pull request and on `main`
(`.github/workflows/`: Backend tests, Backend migrations, Frontend checks,
Dependency audit, Secret scan). This local run is the first gate; CI is
the second opinion before merge. The commands below are the ones CI runs,
so a local PASS means the same thing as a green CI step.

**Arguments:** `$ARGUMENTS` (blank if none were given). Split them on
spaces:

- the word `full`, if present, runs every check whatever the scope;
- any other word is the base branch; with none, the base is `main`.

**Order and stopping.** Run the checks in the order below. Stop at the
first check that FAILS and fill the rest of the table as "not run".

**Honesty.** Every row in the table is a command you actually ran in
this session, with its real outcome. A check you could not run is
"SKIPPED" with the reason, never PASS. A check the scope leaves out is
"SKIPPED (not affected)", never PASS either. Never report a check as
passing that you did not run.

All commands run from the repository root unless they start with
`cd frontend` or `cd backend`.

## 0. Scope

```bash
.claude/skills/preflight/scope.sh <base>
```

Print its two lines (`BACKEND=yes|no`, `FRONTEND=yes|no`) before
anything else. The script reads the paths this branch changes since its
merge-base with `<base>`, plus uncommitted changes and untracked files:

- `backend/` sets BACKEND, `frontend/` sets FRONTEND;
- `docs/` and Markdown files set neither, except under `.claude/`;
- anything else — `.claude/`, `scripts/`, `.github/`, `analytics/`,
  compose files, `Caddyfile`, `.env*.example`, `deploy/`, other root
  files — is shared or ambiguous and sets both.

With the `full` argument, run the script and print its result all the
same, then treat both groups as `yes` and say so.

Checks 1–2 run only if BACKEND=yes, checks 3–7 only if FRONTEND=yes; a
check left out this way is "SKIPPED (not affected)" in the table.

## 1. Backend lint

Only if BACKEND=yes.

```bash
cd backend && uv run ruff check .
```

The first step of `backend-tests.yml`.

## 2. Backend test suite

Only if BACKEND=yes.

```bash
scripts/run_backend_tests.sh
```

`uv run pytest` on the host, as in `backend-tests.yml`, against a
throwaway PostgreSQL started for this run only: its own Compose project
(`<repo folder>-test-<pid>`), a free host port picked at start, removed
on exit whatever the outcome. So it runs whatever else holds port 5435
(another project's `db-test`, another checkout, a parallel session) and
never shares a database with another run. Needs Docker running; if the
script says it could not start `db-test`, report its message and mark
the row FAIL.

The suite never touches the dev database (`db`, port 5434): conftest
refuses a `DATABASE_URL` without `test` in it. Never read or print
`backend/.env.test`.

CI's other backend gate, `backend-migrations.yml` (`alembic upgrade
head` on an empty database), is not run locally: it needs a database
`DATABASE_URL` points at, and only CI gives it a throwaway one. When the
branch adds or changes a file in `backend/alembic/versions/`, say that
this check is left to CI.

## 3–7. Frontend checks

Only if FRONTEND=yes.

Run on the host, in `frontend/` (its `node_modules` is installed there;
the dev container has its own copy). These are the steps of
`frontend-checks.yml`, in its order.

```bash
cd frontend && npx tsc --noEmit -p tsconfig.app.json   # 3. type check
cd frontend && npx oxlint --deny-warnings              # 4. lint
cd frontend && npx prettier --check .                  # 5. format
cd frontend && npm test                                # 6. unit tests (vitest)
cd frontend && npm run build                           # 7. tsc -b && vite build
```

The `-p tsconfig.app.json` is required: a bare `tsc --noEmit` at the
frontend root resolves to `tsconfig.json`'s empty `files` and checks
nothing. `--deny-warnings` matches CI; `npm run lint` alone does not
fail on warnings.

There is no end-to-end suite in this repository.

## Output

End with the scope line (`BACKEND=… FRONTEND=…`, and "full" if it was
given), then this table, one row per check, in order. Every check keeps
its row, the ones the scope left out included; they stay "SKIPPED (not
affected)" even when an earlier check failed.

| # | Check | Command | Result |
|---|---|---|---|
| 1 | Backend lint | `cd backend && uv run ruff check .` | PASS / FAIL / not run / SKIPPED (not affected) |
| 2 | Backend suite | `scripts/run_backend_tests.sh` | PASS (n passed) / FAIL / not run / SKIPPED (not affected) |
| 3 | Type check | `cd frontend && npx tsc --noEmit -p tsconfig.app.json` | … |
| 4 | Lint | `cd frontend && npx oxlint --deny-warnings` | … |
| 5 | Format | `cd frontend && npx prettier --check .` | … |
| 6 | Unit tests | `cd frontend && npm test` | PASS (n passed) / … |
| 7 | Build | `cd frontend && npm run build` | … |

Then, for the failing check, the relevant part of its output, and any
check left to CI (migrations).
