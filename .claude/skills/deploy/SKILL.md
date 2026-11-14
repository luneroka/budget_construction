---
name: deploy
description: Runs a production deployment on the VPS over ssh, following the runbook's Deployment Commands one command at a time. Attended (default) - Yoann approves at GO/NO-GO and before the build. `/deploy unattended` - typing it is Yoann's go for origin/main's tip, and it only falls back to asking on a migration, an env, systemd or postgres change, or any other NO-GO. Always stops on any failure and before any rollback.
disable-model-invocation: true
argument-hint: "[unattended [<sha>]]"
---

# /deploy — production deployment over ssh

Claude runs the deployment. The commands are the runbook's, quoted, not
paraphrased: `docs/architecture/production_deployment_runbook.md` ›
"Deployment Commands", "Caddyfile-only change", "Rollback", "Restore
procedure" and "One-time VPS setup" step 5.

Only Yoann starts this command, by typing it. It is never invoked by an
agent, another session or a skill (`disable-model-invocation: true`).

## Modes

The mode comes from the arguments Yoann typed:

- **Attended** (no arguments): Yoann approves every VPS command, the §3
  GO/NO-GO and the build (§4.4), as today (see "How a command is sent").
- **Unattended** (`unattended`, optionally followed by a revision): typing
  the command is Yoann's go for that revision. It replaces the §3 STOP
  and the §4.4 STOP-before-build, and nothing else. A revision given
  after `unattended` must equal `origin/main`'s tip (§1); if it does not,
  that is a failed precondition: report it and **STOP**.
  Any other arguments: ask Yoann what he meant, and run nothing.

What unattended mode still runs, exactly as attended mode: §1
preconditions (all five workflows green on the revision), the §3
analysis, the backup on every deploy (§4.3), §5 verify, §6 reclaim disk
and the §8 summary.

**Unattended falls back to asking.** If §3 finds any of the following,
say so first, then give GO or NO-GO and **STOP** for Yoann's go, exactly
as attended mode does, and continue the rest of the run in attended mode
(the §4.4 STOP before the build applies again):

- a new or modified Alembic migration;
- any change to `.env.production.example`;
- any change in `deploy/systemd/`;
- any `postgres:` change in `docker-compose.prod.yml`;
- anything else §3 would call NO-GO.

A `Caddyfile` change alone does not stop an unattended run: §4.5
validates it before restarting Caddy, and a failed validation stops the
run.

**On any failure, in either mode, stop** (§7). No rollback or restore
runs without Yoann's explicit approval, whatever the mode.

## The connection

The repository is public, so **the connection details are not in it**.
The ssh host, user and key are in the gitignored
`docs/untracked/vps_information.md` (host) and
`docs/untracked/vps_operations_cheatsheet.md` › §1 (user and key), local
only. `vps.sh` reads them at run time; never read, print or copy them
yourself except to hand Yoann a command he runs. Never write them into a
tracked file, a commit message, a PR or the runbook's Deployment History.

The key's passphrase comes from ssh-agent. If `vps.sh` exits 255 with
"ssh failed", the key is not loaded: ask Yoann to run `ssh-add`, then
retry that one command.

## How a command is sent

**Every forward-path command goes through `vps.sh`**, in both modes:

```bash
.claude/skills/deploy/vps.sh <name>
```

It runs exactly one runbook command per call, each in its own ssh
session, after `cd ~/budget_construction`, through a quoted heredoc, so
the runbook text is sent exactly as written, quotes and `$` included, and
is expanded on the VPS, not on the Mac. Never more than one runbook
command per heredoc: a `docker compose exec` reads whatever is left of
the script as its stdin, so a second command after it would be swallowed
silently. Its exit status is the remote command's (255 for an ssh
failure, 2 for an unknown name, 3 when the connection details cannot be
read).

Its vocabulary is fixed, and an unknown name is refused:

| Name | Runbook command | Step |
|---|---|---|
| `rev` | `git rev-parse HEAD` | §2, §4.2 check |
| `record-rollback` | `git rev-parse HEAD \| tee ~/last-deploy-revision.txt` | §4.1 |
| `pull` | `git pull origin main` | §4.2 |
| `backup` | `./scripts/backup_db.sh` | §4.3 |
| `list-backups` | `ls -lh backups/` | §4.3 |
| `build` | `docker compose … up -d --build --pull always` | §4.4 |
| `caddy-validate` | `docker compose … exec caddy caddy validate --config /etc/caddy/Caddyfile` | §4.5 |
| `caddy-restart` | `docker compose … restart caddy` | §4.5 |
| `caddy-headers` | `curl -sI https://batibudget.com/ \| grep -iE "content-security\|cross-origin\|cache-control"` | §4.5 |
| `ps` | `docker compose … ps -a` | §5 |
| `logs-migrate` | `docker compose … logs migrate \| tail -5` | §5 |
| `health-live` | `curl -fsS https://batibudget.com/api/health/live && echo` | §5 |
| `health-ready` | `curl -fsS https://batibudget.com/api/health/ready && echo` | §5 |
| `prune-builder` | `docker builder prune -f --max-used-space 3GB` | §6 |
| `prune-images` | `docker image prune -f` | §6 |
| `df` | `df -h /` | §6 |

(`docker compose …` is `docker compose --env-file .env.production -f
docker-compose.prod.yml`; the script holds each command in full.)

`.claude/settings.json` allows `vps.sh`, so these calls no longer get a
permission prompt. **Attended mode keeps the approval that prompt gave**:
before each `vps.sh` call, say in one line what it does and wait for
Yoann's go in chat, one call per go, on top of the §3 and §4.4 STOPs.
**Unattended mode** does not ask before `vps.sh` calls: the typed command
covers them, unless the run fell back to asking (see "Modes").

**Anything outside that vocabulary** (the §7 rollback and restore
commands, `git checkout main` after a rollback, `docker system df`) is
not in `vps.sh`, on purpose. Send it, only after Yoann's approval, as a
plain ssh call with the same shape, which stays on the ask list and so
prompts too:

```bash
ssh -i <key> <user>@<host> 'bash -s' <<'EOF'
cd ~/budget_construction
<the runbook command, verbatim>
EOF
```

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
- Never add a name to `vps.sh` during a run.
- The dev and qa agents never deploy. Only the main session runs this,
  when Yoann typed the command.

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
  would land. In unattended mode, a revision Yoann typed must be that
  tip (a prefix of it is fine; anything else is a failure).
- Every workflow ran on that revision and is green (`completed`,
  `success`). All five run on every push to `main` (Backend tests,
  Backend migrations, Frontend checks, Dependency audit, Secret scan),
  so a missing one is a failed precondition too. A run still in
  progress is not green: report it and stop, in either mode.

If any precondition fails, report it and **STOP**.

## 2. Read the deployed revision (rollback target)

```bash
.claude/skills/deploy/vps.sh rev
```

Record it here as the **rollback target**. It is written to
`~/last-deploy-revision.txt` on the VPS in step 4. If it already equals
`<sha>`, there is nothing to deploy: say so and stop.

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
  Any `postgres:` change (`… | grep -nE '^[+-].*postgres:'`) is a
  finding. A `postgres:` major change is the runbook's "One-time:
  PostgreSQL 15 → 18" kind of procedure, not a deploy: NO-GO for this
  procedure.
- **What gets rebuilt**: `git diff --stat <rev>..<sha> -- backend frontend`.
- **The commit list**: `git log --oneline <rev>..<sha>`.

Give **GO** or **NO-GO** first, then the reasons. NO-GO if a migration
was modified after shipping, if a new production variable has no
confirmed value in `.env.production` (Yoann confirms it; never check by
reading the file), or if the Postgres major changes.

- **Attended:** then **STOP** and wait for Yoann's go.
- **Unattended:** if none of the "falls back to asking" findings (see
  "Modes") is present, the typed command is the go: say "GO, unattended"
  with the reasons and carry on to §4 without waiting. If any is
  present, list which, then **STOP** and wait for Yoann's go, and run
  the rest attended.

## 4. Run the Deployment Commands, in order

Each item below is one `vps.sh` call (see "How a command is sent").

1. Record the rollback target: `vps.sh record-rollback`
   (`git rev-parse HEAD | tee ~/last-deploy-revision.txt`).
2. Pull: `vps.sh pull` (`git pull origin main`).
   Then confirm the VPS is on the expected revision with `vps.sh rev`,
   which must equal `<sha>`. Any other revision is a failure (step 7).
3. Back up the database, every deploy, as the Deployment History shows:
   `vps.sh backup` (`./scripts/backup_db.sh`), then `vps.sh list-backups`
   (`ls -lh backups/`).
   The script exits non-zero on any failure (and emails the alert
   address); a non-zero exit is a stop. The newest `db-*.sql.gz.enc`
   must be the one just written and non-empty: an encrypted empty dump
   is only a few dozen bytes, so a size in bytes rather than kilobytes
   is a failure too. Record the file name. If it is missing or empty,
   stop (step 7).
4. The build: `vps.sh build`
   (`docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build --pull always`).
   - **Attended: STOP before the build.** Show the exact command and
     wait for Yoann's explicit go, even if everything before it passed.
   - **Unattended:** the typed command was the go; run it once steps
     1–3 passed.
5. Only if the `Caddyfile` changed: the runbook's "Caddyfile-only
   change" steps after the pull it already had, one per call. Validate
   with the running container's own binary: `vps.sh caddy-validate`.
   Only if its output ends with "Valid configuration":
   `vps.sh caddy-restart`, then `vps.sh caddy-headers`.
   A failed validation is harmless (the running Caddy keeps its loaded
   config): stop and report. If `exec` refuses to run without a TTY,
   stop and ask Yoann before adding `-T` (which is a change to `vps.sh`,
   in its own PR, not during a run).
6. Only if `deploy/systemd/` changed (attended only; unattended has
   already fallen back): give Yoann the `sudo cp` / `daemon-reload` /
   `enable --now` / `list-timers` lines from runbook › "One-time VPS
   setup" step 5 for each changed unit, to run himself.

## 5. Verify

Runbook step 4, one call each: `vps.sh ps`, `vps.sh logs-migrate`,
`vps.sh health-live`, `vps.sh health-ready`.

Report each check as PASS or FAIL:

- `ps -a`: `migrate` and `frontend` show `Exited (0)` (one-shot by
  design). `db`, `backend` and `caddy` all show `Up … (healthy)`. Caddy
  reads `starting` for a while after a recreate or restart. Re-check
  once before calling it a FAIL.
- `logs migrate`: reached head, no traceback, and the new migration's
  revision id when one shipped.
- Both health calls answer. With `-f`, an HTTP error prints nothing
  and fails.

A FAIL is a failure: step 7, in either mode.

The browser smoke test (log in, reload a few times, log out) is
Yoann's. Remind him.

## 6. Reclaim disk

Runbook step 5, only once step 5 here passed, one call each:
`vps.sh prune-builder`, `vps.sh prune-images`, `vps.sh df`.

Report what each prune reclaimed and the disk use. The runbook expects
about a quarter to a third used; if it creeps up, say so
(`docker system df` shows what grew, on Yoann's go, over plain ssh).

## 7. If any step fails

The same in both modes: an unattended run that fails is attended from
here on.

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
  run step 5 again. The `git checkout`, the `up -d --build` without
  `--pull always` and the restore are not in `vps.sh`: each goes as a
  plain ssh call (see "How a command is sent"), which prompts. Step 4.5
  again and step 5 use `vps.sh` as usual, still one approved call at a
  time.
- A rollback leaves the VPS checkout on a detached HEAD, and the
  runbook's next `git pull origin main` needs a branch. The runbook has
  no command for going back; before the next deploy, ask Yoann before
  running `git checkout main` there.

## 8. Summary

End with:

- the mode (attended, unattended, or unattended that fell back to
  asking, and why);
- the deployed revision (`vps.sh rev` after the pull);
- the rollback target;
- the backup file name and size;
- each verification check, PASS or FAIL, and the disk reclaimed;
- anything left for Yoann: the smoke test, `sudo` steps, and a draft
  row for the runbook's "Deployment History" table in the style of the
  existing rows (date, version, what shipped with commits and PRs, the
  backup file, what was rebuilt, migration or not, checks run). The row
  goes into a local commit only once Yoann has read it; nothing from
  `docs/untracked/` goes in it.
