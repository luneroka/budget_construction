---
name: deploy
description: Runs a production deployment on the VPS over ssh, following the runbook's Deployment Commands one command at a time, with Yoann's approval at every step and a stop before the build, on any failure and before any rollback.
disable-model-invocation: true
---

# /deploy — production deployment over ssh

Claude runs the deployment; Yoann approves every step. The commands are
the runbook's, quoted, not paraphrased:
`docs/architecture/production_deployment_runbook.md` › "Deployment
Commands", "Caddyfile-only change", "Rollback", "Restore procedure" and
"One-time VPS setup" step 5.

**The connection details are not in this repository**, which is public.
The ssh host, user and key are in the gitignored
`docs/untracked/vps_information.md` and
`docs/untracked/vps_operations_cheatsheet.md` › §1 (local only). Read them
for those three values and nothing else. Never write them into a tracked
file, a commit message, a PR or the runbook's Deployment History.

## How a command is sent

One runbook command per tool call, each in its own ssh session, so the
`cd` is repeated every time. Each command goes through a quoted heredoc,
so the runbook text is sent exactly as written, quotes and `$` included,
and is expanded on the VPS, not on the Mac:

```bash
ssh -i <key> <user>@<host> 'bash -s' <<'EOF'
cd ~/budget_construction
<the runbook command, verbatim>
EOF
```

Never more than one runbook command per heredoc. A `docker compose exec`
reads whatever is left of the script as its stdin, so a second command
after it would be swallowed silently.

Before each call, say in one line what the command does.

## Rules for the whole procedure

- Never print, `cat`, `grep` or copy `.env.production` or any secret on
  the VPS. Never run `docker compose … config`, which prints resolved
  values. (The runbook's rclone checks grep `.env.production` into
  environment variables; they are one-time setup, not part of a deploy,
  and this procedure never runs them.)
- Never edit files on the VPS outside what the runbook commands do.
- Never run a command that is not in the runbook without asking Yoann
  first and explaining why. That includes `sudo`: `sudo` on `deploy`
  needs a password, so a `sudo` command cannot run over a
  non-interactive ssh call. Hand it to Yoann to run himself.
- Never `scp`, and never push from the VPS.
- The dev and qa agents never deploy. Only the main session runs this.

## 1. Preconditions, checked locally

```bash
git status --porcelain              # must print nothing
git fetch origin main
git rev-parse origin/main           # the revision to deploy
gh run list --branch main --commit <sha> --json workflowName,status,conclusion
```

- The working tree is clean.
- The revision to deploy is the tip of `origin/main`: the runbook
  deploys with `git pull origin main`, so any other revision is not what
  would land.
- Every workflow ran on that revision and is green (`completed`,
  `success`). All five run on every push to `main` (Backend tests,
  Backend migrations, Frontend checks, Dependency audit, Secret scan),
  so a missing one is a failed precondition too.

If any precondition fails, report it and **STOP**.

## 2. Read the deployed revision (rollback target)

Over ssh:

```sh
git rev-parse HEAD
```

Record it here as the **rollback target**. It is written to
`~/last-deploy-revision.txt` on the VPS in step 4.

## 3. Compare and decide

Locally, between the rollback target `<rev>` and the revision to deploy
`<sha>` (`git cat-file -e <rev>^{commit}` first. If it is unknown
locally, `git fetch origin` and retry):

- **New Alembic migrations**:
  `git diff --name-only --diff-filter=A <rev>..<sha> -- backend/alembic/versions`.
  A *modified* existing migration (`--diff-filter=M`) is a finding of its
  own.
- **Environment variables** added, renamed or removed:
  `git diff <rev>..<sha> -- .env.production.example`.
- **`deploy/systemd/`**: `git diff --stat <rev>..<sha> -- deploy/systemd`.
  A changed or new unit needs `sudo cp` and `systemctl` (runbook ›
  "One-time VPS setup" step 5). Those are for Yoann to run, not over ssh.
- **`Caddyfile`**: `git diff --stat <rev>..<sha> -- Caddyfile`. A change
  needs the Caddyfile steps after the build (step 4.5).
- **`docker-compose.prod.yml`**: `git diff <rev>..<sha> -- docker-compose.prod.yml`.
  A `postgres:` major change is the runbook's "One-time: PostgreSQL 15 →
  18" kind of procedure, not a deploy: NO-GO for this procedure.
- **What gets rebuilt**: `git diff --stat <rev>..<sha> -- backend frontend`.
- **The commit list**: `git log --oneline <rev>..<sha>`.

Give **GO** or **NO-GO** first, then the reasons. NO-GO if a migration
was modified after shipping, if a new production variable has no
confirmed value in `.env.production` (Yoann confirms it; never check by
reading the file), or if the Postgres major changes. Then **STOP** and
wait for Yoann's go.

## 4. Run the Deployment Commands, in order

Each line below is one tool call (see "How a command is sent"), with
`cd ~/budget_construction` in front.

1. Record the rollback target:
   ```sh
   git rev-parse HEAD | tee ~/last-deploy-revision.txt
   ```
2. Pull:
   ```sh
   git pull origin main
   ```
   Then confirm the VPS is on the expected revision with
   `git rev-parse HEAD`, which must equal `<sha>`.
3. Back up the database, every deploy, as the Deployment History shows:
   ```sh
   ./scripts/backup_db.sh
   ```
   ```sh
   ls -lh backups/
   ```
   The script exits non-zero on any failure (and emails the alert
   address); a non-zero exit is a stop. The newest `db-*.sql.gz.enc`
   must be the one just written and non-empty: an encrypted empty dump
   is only a few dozen bytes, so a size in bytes rather than kilobytes
   is a failure too. Record the file name. If it is missing or empty,
   stop (step 7).
4. **STOP before the build.** Show the exact command and wait for
   Yoann's explicit go, even if everything before it passed:
   ```sh
   docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build --pull always
   ```
5. Only if the `Caddyfile` changed: the runbook's "Caddyfile-only
   change" steps after the pull it already had, one per call. Validate
   with the running container's own binary:
   ```sh
   docker compose --env-file .env.production -f docker-compose.prod.yml exec caddy caddy validate --config /etc/caddy/Caddyfile
   ```
   Only if its output ends with "Valid configuration":
   ```sh
   docker compose --env-file .env.production -f docker-compose.prod.yml restart caddy
   ```
   ```sh
   curl -sI https://batibudget.com/ | grep -iE "content-security|cross-origin|cache-control"
   ```
   A failed validation is harmless (the running Caddy keeps its loaded
   config): stop and report. If `exec` refuses to run without a TTY,
   stop and ask Yoann before adding `-T`.
6. Only if `deploy/systemd/` changed: give Yoann the `sudo cp` /
   `daemon-reload` / `enable --now` / `list-timers` lines from runbook ›
   "One-time VPS setup" step 5 for each changed unit, to run himself.

## 5. Verify

Runbook step 4, one command per call:

```sh
docker compose --env-file .env.production -f docker-compose.prod.yml ps -a
```
```sh
docker compose --env-file .env.production -f docker-compose.prod.yml logs migrate | tail -5
```
```sh
curl -fsS https://batibudget.com/api/health/live && echo
```
```sh
curl -fsS https://batibudget.com/api/health/ready && echo
```

Report each check as PASS or FAIL:

- `ps -a`: `migrate` and `frontend` show `Exited (0)` (one-shot by
  design). `db`, `backend` and `caddy` all show `Up … (healthy)`. Caddy
  reads `starting` for a while after a recreate or restart. Re-check
  once before calling it a FAIL.
- `logs migrate`: reached head, no traceback, and the new migration's
  revision id when one shipped.
- Both health calls answer. With `-f`, an HTTP error prints nothing
  and fails.

The browser smoke test (log in, reload a few times, log out) is
Yoann's. Remind him.

## 6. Reclaim disk

Runbook step 5, only once step 5 here passed, one command per call:

```sh
docker builder prune -f --max-used-space 3GB
```
```sh
docker image prune -f
```
```sh
df -h /
```

Report what each prune reclaimed and the disk use. The runbook expects
about a quarter to a third used; if it creeps up, say so
(`docker system df` shows what grew, on Yoann's go).

## 7. If any step fails

- Stop immediately. Run nothing further.
- **A failure before the build** (step 4, commands 1–3: the pull or the
  backup) has changed no container: production still runs the rollback
  target. Report it with no rollback commands. The VPS checkout may be
  at the new revision but not built; say so, and Yoann decides what
  next.
- **If step 3 found a migration in this release**, a failure from the
  build on is not handed a rollback directly. A code rollback does not
  undo a migration: the database keeps the new schema. Instead:
  - list the migration files the release added;
  - for each one, say whether it is purely additive (new tables or
    nullable columns, nothing renamed, dropped or made required), and
    why, citing the operations in the file. Look for data changes too:
    `git show <sha>:<file> | grep -niE 'op\.execute|bulk_insert|update|delete|backfill'`.
    A migration with `op.execute`, `bulk_insert`, an `UPDATE`, a
    `DELETE` or a backfill is not purely additive, even if its schema
    change is; cite each match with its line;
  - present the options from runbook › "Rollback": **(a)** the
    code-only rollback below, which the runbook calls safe when the
    migrations are additive ("the newer schema is harmless to the older
    code"); **(b)** fix forward with a new release; **(c)** restore the
    pre-deploy backup (step 4.3), which loses data written since the
    backup. The runbook's restore goes onto a **fresh, empty** database
    ("Restore procedure") and gives no step-by-step for emptying the
    production one: for (c), stop and plan those steps with Yoann
    before running anything;
  - **STOP for Yoann's choice.** Never choose an option yourself, and
    never run `alembic downgrade` (the runbook forbids it in production
    without a reviewed downgrade and a tested restore plan).
- Otherwise, show the runbook › "Rollback" code-only commands, which
  use the recorded rollback target:
  ```sh
  git checkout "$(cat ~/last-deploy-revision.txt)"
  ```
  ```sh
  docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
  ```
  and, if the release being rolled back changed the Caddyfile, step 4.5
  again (validate, then restart caddy). Only if the database itself is
  damaged, the restore of option (c), planned with Yoann:
  ```sh
  scripts/restore_db.sh backups/db-YYYYMMDDTHHMMSSZ.sql.gz.enc --yes
  ```
- Run them only after Yoann's explicit approval, one per call, then
  run step 5 again.
- A rollback leaves the VPS checkout on a detached HEAD, and the
  runbook's next `git pull origin main` needs a branch. The runbook has
  no command for going back; before the next deploy, ask Yoann before
  running `git checkout main` there.

## 8. Summary

End with:

- the deployed revision (`git rev-parse HEAD` on the VPS after the pull);
- the rollback target;
- the backup file name and size;
- each verification check, PASS or FAIL, and the disk reclaimed;
- anything left for Yoann: the smoke test, `sudo` steps, and a draft
  row for the runbook's "Deployment History" table in the style of the
  existing rows (date, version, what shipped with commits and PRs, the
  backup file, what was rebuilt, migration or not, checks run). The row
  goes into a local commit only once Yoann has read it; nothing from
  `docs/untracked/` goes in it.
