---
name: ship
description: Checks that one pull request is ready (CI green, not a draft, up to date with main, a QA verdict) and merges it on GitHub once Yoann approves.
disable-model-invocation: true
---

# /ship — merge one ready PR

The PR number comes from the arguments. If there is none, ask for it and
stop. This procedure merges on GitHub, so the PR is recorded as merged.
It never merges, fast-forwards or pushes `main` locally, and it never
deploys: production picks the merge up only at the next `/deploy`.

## 1. Gather

```bash
gh pr view <n> --json number,title,headRefName,baseRefName,isDraft,mergeStateStatus,headRefOid,url
gh pr checks <n>
```

## 2. Check

- **CI green.** Every check in `gh pr checks <n>` passes. `main` has no
  branch protection, so GitHub marks no check as "required": treat
  every check that ran as required. A pending check is not green; wait
  for it or report it. Every workflow runs on every PR here (Backend
  tests, Backend migrations, Frontend checks, Dependency audit, Secret
  scan), so a missing one is a finding: say which.
- **Not a draft.** `isDraft` is `false`.
- **Up to date with `main`.** `baseRefName` is `main` and
  `mergeStateStatus` is not `BEHIND` or `DIRTY`. If it is, report it:
  the branch needs `main` merged in or a rebase first, and that is
  Yoann's call, not this procedure's.
- **A QA verdict exists** for the PR's current head commit
  (`headRefOid`): either one from the `qa` agent earlier in this
  session, or a `VERDICT:` line in the PR conversation
  (`gh pr view <n> --comments`) that names that commit. A verdict on an
  older commit does not count. Dependabot PRs are the exception: their
  evidence is the `/deps` batch run, not a QA verdict.

  If none exists, run the `qa` agent on the PR: the working tree must
  be clean (`git status`; if not, stop and ask). Note the current
  branch, `gh pr checkout <n>`, then call `qa` with base branch `main`
  and the spec file if the PR adds or names one under `docs/specs/`
  (`gh pr diff <n> --name-only`). Without a spec it reviews against the
  project's rules and the PR description. Switch back to the noted
  branch afterwards.

## 3. Report and STOP

A checklist, each line with its evidence:

- [ ] CI green — the checks and their state
- [ ] Not a draft
- [ ] Up to date with `main` — `mergeStateStatus`
- [ ] QA verdict — PASS or FAIL, the commit it was given on, and where
      it came from

Anything not ticked is stated plainly, with what would fix it. A check
the QA verdict reports as not run or SKIPPED is relayed as such, never
as green. Then stop and
wait for Yoann's approval. A FAIL verdict or a red check is reported,
not merged around, unless he says so explicitly for this PR.

## 4. Merge, on approval

```bash
gh pr merge <n> --squash --match-head-commit <headRefOid>
```

Squash, as the recent PRs merged into `main`. `<headRefOid>` is the
commit checked in step 2: if the head moved since, GitHub refuses the
merge and the checks start again. Never `git merge`, `git push` or a
local fast-forward of `main`. Report the merge commit
(`gh pr view <n> --json mergeCommit,state`).
