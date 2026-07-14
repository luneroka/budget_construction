# Production Deployment Runbook

## Target Architecture

- Provider: Hetzner Cloud
- VPS: CX23 (2 vCPU, 4 GB RAM, 40 GB SSD, Intel/AMD)
- **Actual:** CPX12 (2 vCPU, 2 GB RAM) was provisioned instead — the
  Cost-Optimized (CX) tier was unavailable at signup time. See "VPS
  Information" below for details.
- OS: Ubuntu 24.04 LTS
- Reverse proxy: Caddy
- Containers: Docker Compose
- Backend: FastAPI
- Database: PostgreSQL (Docker)
- Storage: Cloudflare R2
- HTTPS: Let's Encrypt (via Caddy)

## Responsibilities

| Phase   | Owner | Description                                                         |
| ------- | ----- | ------------------------------------------------------------------- |
| Chunk 0 | Codex | Review deployment architecture only. No code changes.               |
| Chunk 1 | Codex | Prepare the repository for production deployment.                   |
| Chunk 2 | You   | Provision the Hetzner VPS (account, CX23, Ubuntu, SSH).             |
| Chunk 3 | You   | Secure and prepare the server (updates, firewall, Docker, Compose). |
| Chunk 4 | Both  | Deploy the application and validate containers.                     |
| Chunk 5 | Both  | Configure the domain, DNS and HTTPS.                                |
| Chunk 6 | You   | Execute the production smoke test and validate the application.     |

## Sequence

1.  Chunk 0 (Codex): deployment architecture review.
2.  Chunk 1 (Codex): production repository preparation.
3.  Provision the VPS.
4.  Secure the server.
5.  Deploy the application.
6.  Configure the domain and HTTPS.
7.  Validate production.

## Delivery Status

- [x] Chunk 0 — deployment architecture review completed on 2026-07-10.
- [x] Chunk 1 — production repository preparation completed on 2026-07-10.
- [x] Chunk 2 — VPS provisioning completed on 2026-07-13.
- [x] Chunk 3 — server hardening and Docker setup completed on 2026-07-13.
- [x] Chunk 4 — first deployment and container validation completed on 2026-07-13.
- [x] Chunk 5 — domain, DNS, and HTTPS configuration completed on 2026-07-13.
- [x] Chunk 6 — production smoke test completed on 2026-07-13.

# CODEX Prompt -- Chunk 0

Review the repository from a production deployment perspective.

Do NOT modify any files.

Audit: - Dockerfiles - docker-compose - environment variables - backend
configuration - frontend configuration - networking - persistent
volumes - PostgreSQL - Cloudflare R2 - SMTP - health checks - reverse
proxy strategy

Output: 1. Current architecture. 2. Production gaps. 3. Recommended
architecture. 4. Files that will need modification during Chunk 1. 5.
Deployment checklist.

## Chunk 0 Audit (2026-07-10)

Scope: repository review only. No application or deployment files were changed
for this audit; this runbook section is the requested audit output.

### 1. Current architecture

The repository contains a development-only Compose stack:

- `frontend` builds `frontend/Dockerfile`, bind-mounts the source tree, and
  runs the Vite development server on host port `5173`.
- `backend` builds `backend/Dockerfile`, bind-mounts the source tree, and runs
  `fastapi dev` on host port `8000`. It reads `.env` and has its development
  `APP_URL` forcibly set to `http://localhost:5173`.
- `db` uses `postgres:15`, persists data to the named `db_data` volume, and is
  exposed on host port `5434`. `db-test` is also part of the default stack and
  is exposed on `5435` with fixed test credentials.
- The backend uses async SQLAlchemy/asyncpg and validates connectivity at
  application startup with a simple query. Alembic migrations exist but are
  not invoked by Compose or the container startup command.
- The frontend's API URL is a build-time Vite variable,
  `VITE_API_BASE_URL`, defaulting to `http://127.0.0.1:8000`. The existing
  `.env.example` instead documents `VITE_API_URL`, which is not consumed.
- CORS is configured for local Vite origins only. No Caddy configuration,
  proxy routing, TLS configuration, or production networking policy exists.
- Documents are stored remotely in Cloudflare R2 through boto3 using an
  account endpoint, access key, secret, and bucket. Downloads use five-minute
  presigned URLs. PostgreSQL stores document metadata; no document files are
  stored in the VPS volume.
- Email is sent through Resend's HTTPS API (not SMTP), using `RESEND_API_KEY`
  and `RESEND_FROM`; issue reports optionally use `SUPPORT_EMAIL`. Password
  reset URLs derive from `APP_URL`.
- JWT signing settings are required at backend import time, but their settings
  model defaults are optional. The checked-in example supplies them.

### 2. Production gaps

| Area                | Finding and consequence                                                                                                                                                                                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Images              | Both Dockerfiles run development servers; the backend uses `fastapi dev`, and the frontend neither builds static assets nor serves them from a production web server. The backend also has no `.dockerignore`.                                                              |
| Compose/networking  | The current file bind-mounts source code, exposes frontend, API, production DB, and test DB ports, and starts a test database in normal deployments. It has no isolated production network or restart policy.                                                               |
| Reverse proxy/TLS   | No Caddyfile or certificate-state volumes exist. Direct port exposure would bypass the intended HTTPS entry point.                                                                                                                                                          |
| Database            | PostgreSQL has persistence, but no health check, migration job, resource/log rotation policy, backup/restore procedure, or tested restore. `depends_on` only means the DB container started, not that it is ready.                                                          |
| Health/operations   | There is no unauthenticated liveness/readiness endpoint and no container health checks. `/openapi.json` being available is not a database readiness check.                                                                                                                  |
| Configuration       | Production CORS origins are not configurable in the example, `VITE_API_URL` is a stale variable name, and `APP_URL` can be incorrectly overridden by Compose. Required secrets and production-safe defaults are not documented as such.                                     |
| R2                  | The basic client implementation is appropriate, but the deployment has no documented least-privilege R2 credentials, bucket policy/CORS decision, lifecycle policy, or upload/download smoke test. R2 configuration is only checked when a document operation is attempted. |
| Email               | Resend is configured in code, but domain verification, sender identity, support inbox, and production reset-link verification are not in the runbook. The requested SMTP audit therefore finds SMTP is not used.                                                            |
| Resilience/security | There is no documented secret-management process, database backup target/retention, image-update procedure, firewall policy, or log/monitoring plan. A 4 GB VPS also needs conservative service limits and log rotation.                                                    |

### 3. Recommended architecture

Use a separate `docker-compose.prod.yml` that does not reuse development
bind mounts, dev commands, or host port mappings.

```text
Internet (80/443 only)
        |
      Caddy ── serves built React SPA
        |\
        | \─ /api/* (strip /api) ──> FastAPI :8000 (internal only)
        |
        └── automatic Let's Encrypt certificates

FastAPI ──> PostgreSQL :5432 (internal only; named persistent volume)
        ├──> Cloudflare R2 (HTTPS)
        └──> Resend API (HTTPS)
```

- Build the frontend once and let Caddy serve the static SPA with a fallback to
  `index.html`. Configure `VITE_API_BASE_URL=/api` at build time. Caddy should
  use `handle_path /api/*` so the backend keeps its existing root-level route
  paths. Do not expose the backend or database to the host.
- Run FastAPI with a production ASGI command (not reload/dev mode), as a
  non-root user, with one or two workers appropriate to the CX23. Add a
  lightweight liveness endpoint and a readiness endpoint that checks the DB.
- Give PostgreSQL a `pg_isready` health check. Run Alembic as an explicit,
  one-shot `migrate` service/job before enabling the API, and make the API
  depend on a healthy DB. Never run seed scripts in production startup.
- Use same-origin browser traffic through Caddy. Set CORS explicitly to the
  production HTTPS origin (and only any intentional additional origins); it
  should not retain localhost defaults in production.
- Persist Caddy's `/data` and `/config` plus PostgreSQL data. Back up the
  PostgreSQL database off-host daily (encrypted, retained, and restore-tested);
  Docker volumes alone are not backups. R2 documents remain external and need
  their own lifecycle/retention decision.
- Store real production values only in an ignored server-side `.env.production`
  (or an equivalent secret manager), chmod it to `600`, and commit only a
  redacted `.env.production.example`. Generate a high-entropy JWT secret;
  set a HTTPS `APP_URL`; use scoped R2 credentials; and use a verified Resend
  sender/domain.

### 4. Files that need modification in Chunk 1

| File                            | Required Chunk 1 change                                                                                                                                                                       |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docker-compose.prod.yml` (new) | Production services for Caddy, frontend/static assets, backend, migration job, and PostgreSQL; internal networking, named volumes, health checks, restart policies, and no host DB/API ports. |
| `backend/Dockerfile`            | Production image/command, dependency-only runtime, non-root user, and no dev server.                                                                                                          |
| `backend/.dockerignore` (new)   | Exclude `.env*`, virtual environments, caches, tests, and local artifacts from the build context.                                                                                             |
| `frontend/Dockerfile`           | Multi-stage production build that accepts `VITE_API_BASE_URL` and produces static assets for Caddy.                                                                                           |
| `Caddyfile` (new)               | HTTPS site, SPA fallback, `/api` reverse proxy with prefix stripping, and safe proxy headers.                                                                                                 |
| `.env.production.example` (new) | Correct variable names and all required production configuration, with placeholders only. Include `VITE_API_BASE_URL=/api`, production CORS origin, R2, Resend, and database settings.        |
| `.env.example`                  | Correct the stale `VITE_API_URL` name, or clearly limit this file to local development and point production users to the new example.                                                         |
| `backend/app/core/settings.py`  | Make production CORS configuration explicit and fail clearly for required production settings rather than relying on localhost defaults.                                                      |
| `backend/app/main.py`           | Add liveness/readiness endpoints and production metadata/configuration needed by the Compose health check.                                                                                    |
| `README.md`                     | It is currently empty; add the deployment, backup/restore, upgrade, rollback, and validation instructions required by Chunk 1.                                                                |
| `.gitignore`                    | Ensure server production env files and any backup artifacts cannot be committed (the existing `.env` rule does not cover a root `.env.production` by name).                                   |

No changes to business routers, domain services, migration history, or R2
storage semantics are required for Chunk 1.

### 5. Deployment checklist

- [ ] Provision Ubuntu 24.04 CX23; configure SSH keys, a non-root sudo user,
      unattended security updates, and a firewall allowing only SSH, HTTP, and
      HTTPS. Install Docker Engine and the Compose plugin.
- [ ] Configure Docker log rotation and automatic image cleanup to prevent disk exhaustion over time.
- [ ] Register the production domain and create DNS A/AAAA records for the
      VPS. Confirm ports 80 and 443 are reachable before starting Caddy.
- [ ] Complete Chunk 1 and review the generated production Compose
      configuration with `docker compose --env-file .env.production -f
docker-compose.prod.yml config`.
- [ ] Create the production secret file outside version control with a strong
      `SECRET_KEY`, correct database password/URL, HTTPS `APP_URL`, exact CORS
      origin, and R2/Resend credentials. Restrict its file permissions.
- [ ] Create the R2 bucket and least-privilege API token; verify upload,
      presigned download, deletion, and the intended bucket lifecycle/retention.
- [ ] Verify the Resend domain/sender and support recipient; test password
      reset and an issue-report email from the public HTTPS site.
- [ ] Start PostgreSQL, wait for its health check, run Alembic migration once,
      then start the API, frontend, and Caddy. Confirm no backend or DB port is
      reachable from the public internet.
- [ ] Verify `/api/health/live` and `/api/health/ready`, login, authenticated
      API calls, SPA refresh/deep links, document upload/download, email flows,
      and automatic HTTPS renewal.
- [ ] Schedule encrypted off-host PostgreSQL backups with retention; perform
      and document a restore test before accepting production traffic.
- [ ] Record the deployed image revision, retain the prior image/revision for
      rollback, and monitor container health, disk space, DB volume growth, Caddy
      certificate renewal, and external-service failures.

# CODEX Prompt -- Chunk 1

Prepare the repository for production deployment.

Edit only the repository.

Implement: - docker-compose.prod.yml - production-ready Dockerfiles
where needed - Caddyfile - .env.production.example - health checks -
production configuration - README deployment section

Do NOT deploy anything. Do NOT modify business logic.

At the end output: 1. Files changed. 2. Production architecture. 3.
Remaining manual VPS steps.

**Note:** The repository `README.md` is currently empty. Chunk 1 must create a complete README including instructions for local development, production deployment, architecture overview, environment variables, backup/restore, upgrade procedure, and rollback procedure.

## VPS Information

- Provider: Hetzner
- Plan: CPX12 (2 vCPU, 2 GB RAM, 40 GB SSD, AMD)
- Region: Germany
- Primary IPv4: 167.233.213.9
- Primary IPv6: 2a01:4f8:c015:aeae::1
- Ubuntu version: 24.04.4 LTS (Noble Numbat)
- Domain: batibudget.com
- Hostname:
- SSH public key:
- Docker version: 29.6.1 (build 8900f1d)
- Docker Compose version: v5.3.1
- PostgreSQL version: 15 (postgres:15-alpine)
- Caddy version: 2 (caddy:2-alpine)
- VPS creation date: 2026-07-13

**Note:** The instance actually provisioned is a CPX12 (2 vCPU, 2 GB
RAM), not the CX23 (2 vCPU, 4 GB RAM) specified in the "Target
Architecture" section above. The Cost-Optimized (CX) tier was
unavailable at signup time, so the Shared vCPU AMD (CPX) tier was used
instead. This means the VPS has half the RAM (2 GB vs 4 GB) budgeted in
the target architecture — worth accounting for when tuning FastAPI
worker count, Postgres memory settings, and swap/log rotation.

**Note:** At first login, the system message reported 0 updates
immediately available, but also that the package index itself was more
than a week old — i.e. Ubuntu's default weekly `apt` refresh hadn't run
yet on this brand-new instance, so "0 updates" reflects a stale index,
not a confirmed up-to-date system. Chunk 3 must therefore start with
`apt update` (to refresh the index) followed by `apt upgrade` (to apply
whatever it then reports), before any firewall, Docker, or Compose
setup.

## Chunk 3 Result (2026-07-13)

Server hardening and Docker setup completed manually via SSH, in this order:

1. `apt update && apt upgrade -y`, followed by a reboot to load kernel
   `6.8.0-134-generic`.
2. Created non-root sudo user `deploy` (`adduser deploy`,
   `usermod -aG sudo deploy`).
3. Copied the SSH key/`authorized_keys` from `root` to `deploy` via
   `rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy`; verified
   key-based login and `sudo` access as `deploy` before proceeding.
4. Hardened `/etc/ssh/sshd_config`: `PermitRootLogin no` and
   `PasswordAuthentication no`, then `systemctl restart ssh`. Verified
   `deploy` key login still works and direct `root` SSH login is refused.
5. Configured UFW: allowed OpenSSH, `80/tcp`, and `443/tcp` (IPv4 and
   IPv6), then `ufw enable`. No other inbound ports are reachable.
6. **Deviation from target architecture:** added a 2 GB swap file
   (`/swapfile`, persisted in `/etc/fstab`) as a safety margin against
   out-of-memory conditions, since the provisioned CPX12 has 2 GB RAM
   versus the 4 GB assumed for the CX23 in the Target Architecture
   section. Confirmed active via `free -h`.
7. Installed and enabled `unattended-upgrades` for automatic security
   patching.
8. Installed Docker Engine and the Compose plugin via Docker's official
   install script; added `deploy` to the `docker` group; verified with
   `docker run hello-world` (no `sudo` required).
9. Configured Docker log rotation in `/etc/docker/daemon.json`
   (`json-file` driver, `max-size: 10m`, `max-file: 3`) to prevent
   unbounded log growth on the 40 GB disk; restarted Docker and
   re-verified with `docker run hello-world`.

No application containers were deployed in this chunk. The server is
hardened, firewalled, swap-enabled, and Docker-ready for Chunk 4.

## Chunk 4 Result (2026-07-13)

Application deployed and validated on the VPS via SSH, in this order:

1. Cloned the repository to `~/budget_construction` on the VPS as `deploy`
   (public repo, plain `git clone` over HTTPS).
2. Created `.env.production` from `.env.production.example` with real secrets
   (domain `batibudget.com`, generated `POSTGRES_PASSWORD`/`SECRET_KEY`, R2
   and Resend credentials), `chmod 600`. **Incident:** early secret values
   were inadvertently pasted into this chat session via a screenshot; every
   exposed secret (Postgres password, JWT secret, R2 API token, Resend API
   key) was rotated before deployment continued. Lesson for future chunks:
   never screenshot or paste `.env.production` contents anywhere outside the
   server — verify with `grep`/line counts only.
3. Validated `docker compose --env-file .env.production -f
   docker-compose.prod.yml config --quiet` — passed silently.
4. Built the `migrate`, `backend`, and `frontend` images.
5. Started services in dependency order — `db` → `migrate` → `backend` →
   `frontend` → `caddy` — verifying health or exit status at each step
   individually rather than a single `up -d`, since this was the first
   production start.
6. Verified full-stack health: `docker compose ps -a` shows `db`/`backend`/
   `caddy` healthy and `migrate`/`frontend` exited `(0)`; `curl -I
   https://batibudget.com` returns `200`; `/api/health/live` and
   `/api/health/ready` both return `{"status":"ok"}`; the SPA loads correctly
   in a browser with a valid certificate; `backend`'s port `8000` is
   confirmed unreachable from the public internet.
7. Captured a RAM baseline under live load: `free -h` showed ~830 MB used,
   ~1.1 GB available out of 1.9 GB total, with swap barely touched (63 MB of
   2 GB — no sustained memory pressure). `docker stats --no-stream` showed
   `backend` ~322 MB, `db` ~36 MB, `caddy` ~18 MB. No change was needed to
   the 2-worker FastAPI configuration decided in the Step 1 pre-flight
   review; the 2 GB RAM budget (vs. the 4 GB originally targeted) held up
   fine under this load.

### Deviations and fixes made to the repository during this chunk

The following issues were only discoverable by actually building and running
the production image — they didn't surface in Chunk 1's build-only
validation. All were fixed via commits directly to `main`:

1. **`ENV UV_NO_CACHE=1`** (commit `a283a37`) — `uv run --no-sync` still
   attempted to create a cache directory at `/app/.cache/uv`, which the
   non-root `app` user couldn't write to.
2. **`RUN chown -R app:app /app`** (commit `a84e15e`) — `/app/.venv` was
   created by `uv sync` while still running as `root` (before the `app` user
   existed), so it stayed root-owned even after the later `COPY --chown`
   step, which only covers files copied from the build context, not
   directories created by earlier `RUN` steps.
3. **`ENV UV_PYTHON_INSTALL_DIR=/app/.uv-python`** (commit `1abe845`) — this
   base image ships no system Python; `uv sync` auto-downloads one to satisfy
   `requires-python`, and it defaulted to installing under root's home
   directory (`/root`, permission `700`), unreachable for `app` even after
   the chown fix above.
4. **`ln -s /app/.venv/bin/python3 /usr/local/bin/python`** (commit
   `51aa81b`) — the container healthcheck runs `python -c "..."` directly
   (not via `uv run`), and with no system Python on `PATH`, the healthcheck
   failed even though the FastAPI app itself started and ran correctly.
5. **Analytics SQL packaging** (commit `ad7df40`) — 5 migrations load SQL
   files from a path computed as 3 directories above the migration file,
   which resolves to the repo root in local dev but only to `/` inside the
   container, since the backend image's build context is scoped to
   `./backend` and never includes the repo-root `analytics/` directory.
   **Deviation:** rather than changing the build context to the repo root
   (which would require relocating `.dockerignore` and would bloat the build
   context on this resource-constrained VPS), the SQL files were duplicated
   into `backend/analytics/sql/` and the path depth adjusted accordingly.
   **Known tradeoff, flagged for follow-up:** `analytics/sql/` now exists in
   two places (repo root and `backend/`); a future cleanup should either
   symlink them or move to a repo-root build context to avoid the two
   copies drifting apart.

### Note on Chunk 5 overlap

DNS for `batibudget.com` (A/AAAA records pointed at the VPS) was configured
during this chunk, ahead of its nominal Chunk 5 slot, because
`.env.production` needed a real `DOMAIN` value and Caddy's automatic HTTPS
needed DNS live before `caddy` could start. Caddy obtained its Let's Encrypt
certificate successfully on the first attempt, no workaround needed. See the
Chunk 5 Result section below for how the related `batibudget.fr`/`www`
domains were subsequently handled. `www.batibudget.com` itself still shows
OVH's default placeholder page and was left unresolved — a future chunk
should decide whether it should also serve the app or redirect to the apex
domain.

## Chunk 5 Result (2026-07-13)

Domain, DNS, and HTTPS configuration completed, partly ahead of schedule
during Chunk 4 (see note above) and finished afterward:

1. `batibudget.com` — apex A/AAAA records point at the VPS; Caddy obtained
   and serves a Let's Encrypt certificate automatically (see Chunk 4 Result).
2. `batibudget.fr` and `www.batibudget.fr` — set up to redirect to
   `https://batibudget.com`, with one detour worth recording:
   - First attempt used OVH's built-in domain "Web Redirection" product
     (visible, permanent/301). This worked correctly over plain HTTP, but
     **OVH's redirect service has no TLS listener on port 443 at all** —
     `https://batibudget.fr` failed to connect outright rather than
     redirecting. Since most browsers try HTTPS first by default, this
     redirect would have silently failed for most visitors.
   - **Fix:** removed the OVH redirection entries, pointed
     `batibudget.fr`/`www.batibudget.fr`'s A/AAAA records directly at the
     VPS instead (via OVH's "redirect to an IP" DNS wizard, which sidesteps
     a "target already configured" conflict that blocked adding the A
     record through the plain DNS zone editor directly), and added a second
     Caddy site block (commit `d3f33aa`) that gets its own Let's Encrypt
     certificate for both hostnames and issues the redirect itself:
     `redir https://batibudget.com{uri} permanent`.
   - **Deployment gotcha:** after pushing the new `Caddyfile` and `git
     pull`-ing on the VPS, `caddy reload` reported `"config is unchanged"`
     and `cat`-ing the file inside the running container showed the *old*
     content. Cause: Docker's single-file bind mount
     (`./Caddyfile:/etc/caddy/Caddyfile:ro`) locks onto a specific inode at
     container-creation time; `git pull` replaces files via write-temp-then-
     rename rather than editing in place, which swaps in a new inode at that
     path and orphans the one Docker had mounted. A plain `restart` doesn't
     fix this since Compose only recreates containers when it detects a
     config change. **Fix:** `docker compose up -d --force-recreate caddy`
     to force a fresh bind mount. Worth remembering for any future
     `Caddyfile`-only change: `--force-recreate` is required, not just
     `restart` or `caddy reload`.
   - Verified end-to-end after the fix: `https://batibudget.fr` and
     `https://www.batibudget.fr` both return `301` to
     `https://batibudget.com/`, then `200`, with valid Caddy-issued certs.

## Chunk 6 Result (2026-07-13)

Production smoke test performed manually against the live site by the
project owner. Verified:

- Core app flow: registration via `POST /api/auth/register` (no signup form
  exists in the frontend yet — this was called directly), login, promotion
  to admin via direct SQL, authenticated API calls, project creation from
  the "Maison Plain-Pied" template (see the template seed script added
  earlier this session, commit `deeead3`), SPA navigation.
- Document upload and download, exercising the Cloudflare R2 integration.
- Email flows (password reset and/or issue report), exercising the Resend
  integration.
- `/api/health/live` and `/api/health/ready` were already verified during
  Chunk 4's container validation.
- Automatic HTTPS renewal was not directly testable (certificates were just
  issued), but Caddy's logs confirm the renewal-scheduling mechanism is
  active — it computed renewal windows for every certificate immediately
  after issuance.

**Not yet covered, flagged as open work:** encrypted off-host PostgreSQL
backups with a tested restore procedure. The `Rollback` and
`Disaster Recovery` sections below are still placeholders. The original
Chunk 0 deployment checklist treats backups as required "before accepting
production traffic," so this should be prioritized next despite the
application itself now being validated end-to-end.

## Deployment Commands

Standard deploy of a new revision, run as `deploy` in `~/budget_construction`
on the VPS. This procedure was used and verified for the refresh-token
release on 2026-07-13.

```sh
cd ~/budget_construction

# 1. Record the current revision as a rollback target.
git rev-parse HEAD | tee ~/last-deploy-revision.txt
git pull origin main

# 2. Back up the database first (still on-host only until off-host backups
#    are automated). Always do this before a deploy that runs a migration.
mkdir -p backups
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T db \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  | gzip > backups/pre-deploy-$(date +%F).sql.gz
ls -lh backups/   # confirm the dump is non-empty

# 3. Build and start. Compose's dependency order handles it safely:
#    db (stays up, data preserved) -> migrate (alembic upgrade head)
#    -> backend (only after migrate succeeds) -> frontend (re-copies the
#    SPA bundle) -> caddy.
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build

# 4. Verify.
docker compose --env-file .env.production -f docker-compose.prod.yml ps -a
docker compose --env-file .env.production -f docker-compose.prod.yml logs migrate | tail -5
curl -fsS https://batibudget.com/api/health/live && echo
curl -fsS https://batibudget.com/api/health/ready && echo
```

Expect `migrate` and `frontend` to show `Exited (0)` (one-shot services);
`db`, `backend`, and `caddy` should be `Up ... (healthy)`. Then do a browser
smoke test: log in, reload a few times (confirms the refresh-token session
survives), and log out.

## Rollback

Code-only rollback (the common case — a bad application revision, database
schema intact):

```sh
cd ~/budget_construction
git checkout "$(cat ~/last-deploy-revision.txt)"
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

Migrations in this project are additive (e.g. the `refresh_tokens` table is
unused by older code), so a code rollback generally needs **no** database
downgrade — the newer schema is harmless to the older code. Only restore a
backup if the database itself is actually damaged (see Disaster Recovery).
Do not run `alembic downgrade` in production unless the specific migration
has a reviewed downgrade and a tested restore plan.

To restore the pre-deploy database dump onto a fresh/empty database:

```sh
gunzip -c backups/pre-deploy-YYYY-MM-DD.sql.gz \
  | docker compose --env-file .env.production -f docker-compose.prod.yml exec -T db \
      sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

**Note:** as of 2026-07-13 the code-only rollback path is documented and
low-risk but has not been exercised against production; the restore command
above has not been run end-to-end either. Both should be validated as part
of the outstanding backup/restore task below.

## Disaster Recovery

Automated encrypted PostgreSQL backups were implemented on 2026-07-13
(`scripts/backup_db.sh` / `scripts/restore_db.sh`). The backup/restore cycle
was tested end-to-end against a full database copy (see "Restore validation"
below).

### What is and isn't protected

- **PostgreSQL** — covered by the daily encrypted backup below (on-host copy
  plus an off-host copy in Cloudflare R2).
- **Cloudflare R2 documents** — covered by a separate daily one-way mirror
  (`scripts/backup_documents.sh`, see "Documents mirror" below), in addition
  to the PostgreSQL metadata that references them (backed up as part of the
  database above).
- **Secrets** — `.env.production` is **not** in any backup (by design). It
  must be recreated from the values in your password manager during a
  rebuild. The `BACKUP_ENCRYPTION_PASSPHRASE` in particular must be stored
  off the VPS, or every backup is unrecoverable.

### Objectives

- **RPO (max data loss):** ~24 h — backups run daily. Lower it by making the
  timer more frequent (e.g. `OnCalendar=*-*-* *:00:00` for hourly).
- **RTO (time to restore):** minutes — the database is small; a restore is a
  single decrypt-and-load pipeline.

### How the backup works

`scripts/backup_db.sh` streams `pg_dump | gzip | openssl AES-256` to a
timestamped `db-<UTC>.sql.gz.enc` under `./backups`, then uploads it to the
`BACKUP_R2_BUCKET` via `rclone` and prunes copies older than the retention
windows (local `BACKUP_LOCAL_RETENTION_DAYS`, default 7; remote
`BACKUP_REMOTE_RETENTION_DAYS`, default 30). Plaintext never touches disk. A
`pg_dump` failure aborts the whole pipeline (via `pipefail`) so a truncated
file is never promoted to a real backup, and the script exits non-zero on any
error so the systemd job is marked failed. All backup config lives in
`.env.production` (see `.env.production.example`).

**Failure alerting (2026-07-13).** Any failure -- a bad DB connection, a
missing dependency, an R2 upload error -- sends an email via Resend (reusing
the app's own `RESEND_API_KEY`/`RESEND_FROM`, no separate config) to
`BACKUP_ALERT_EMAIL` (defaults to `SUPPORT_EMAIL`), via `set -Eeuo pipefail`
plus an `ERR` trap so it fires for both explicit checks (`die()`) and
unexpected pipeline failures. The alert itself is fully best-effort: if
Resend is unreachable or misconfigured, the script logs a warning and still
exits non-zero rather than masking the original failure or crashing on the
alert path itself. Verified locally: a clean run sends no email; a real
failure (missing `rclone`) sent and Resend accepted a real alert email; a
simulated failure with an intentionally invalid Resend key logged a warning
and still exited non-zero, with no partial backup file left behind. No
success/heartbeat email is sent -- only failures page you, by design.

### Documents mirror (2026-07-13)

**R2 has no object or bucket versioning.** This was checked directly against
Cloudflare's current docs and release notes: the only "versioning" reference
is a compatibility shim from 2022 that makes `GetBucketVersioning` return a
plausible-looking S3 response without actually versioning anything, and
there is an open, unresolved community feature request for real versioning.
So a permanent delete of an R2 object -- whether from an app bug or a
compromised account -- is genuinely unrecoverable by any R2-native means.

**The substitute:** `scripts/backup_documents.sh` runs `rclone copy` (never
`rclone sync`) from the live documents bucket (`R2_BUCKET_NAME`) to a
separate, dedicated mirror bucket (`DOCS_BACKUP_R2_BUCKET`) daily.
`rclone copy` is one-way and additive-only -- it uploads new/changed objects
but **never** deletes anything from the destination, even when the source
object is deleted or the sync direction would suggest it should. This means
a deleted (or overwritten) document remains recoverable from the mirror
bucket even after it's gone from the live bucket. Retention on the mirror
side is enforced natively by an **R2 Object Lifecycle Rule** on the mirror
bucket itself (age-based expiration, not something this script does), so the
mirror doesn't grow forever while still giving a real undelete window.
Uses a dedicated R2 API token scoped to Object Read & Write on only the live
documents bucket and the mirror bucket (not the database-backups bucket).
Failure alerting works identically to `backup_db.sh` (same shared library,
`scripts/lib/backup_common.sh`, factored out of both scripts to avoid
duplicating the Resend-alert logic).

Since rclone performs a server-side copy between two buckets on the same R2
account, this does not consume VPS disk space or meaningfully use its
bandwidth for the file contents. Scheduled at 06:45 UTC daily (`Persistent`),
offset 45 minutes after the 06:00 UTC database backup so the two jobs don't
contend for VPS resources.

**Recommended lifecycle rule on the mirror bucket:** age-based expiration at
30 days (matches the retention window originally intended for versioning).
Set this directly on the mirror bucket via the Cloudflare dashboard --
R2 → select the mirror bucket → Settings → Object Lifecycle Rules → Add
rule → "Delete objects" after 30 days of the object's age. This can also be
set via `wrangler r2 bucket lifecycle add` or the S3 `putBucketLifecycleConfiguration`
API if preferred.

### One-time VPS setup

1. **Create a dedicated R2 backups bucket** (e.g. `budget-construction-backups`)
   and an API token scoped to **only** that bucket (do not reuse the documents
   bucket or its token).
2. **Install rclone** (used for the R2 upload/prune):
   `sudo -v ; curl https://rclone.org/install.sh | sudo bash`. `openssl` and
   `gzip` are already present on Ubuntu.
3. **Fill the backup settings in `.env.production`** (see the "Database
   backups" block in `.env.production.example`): a strong
   `BACKUP_ENCRYPTION_PASSPHRASE` (**also save it in your password manager,
   off the VPS**), `BACKUP_R2_BUCKET`, `BACKUP_R2_ENDPOINT` (same account
   endpoint as `R2_ENDPOINT_URL`), and the scoped
   `BACKUP_R2_ACCESS_KEY_ID` / `BACKUP_R2_SECRET_ACCESS_KEY`.
4. **Run one backup by hand and confirm it lands in R2:**
   ```sh
   cd ~/budget_construction
   ./scripts/backup_db.sh
   # then, using the same rclone env, confirm the object exists:
   RCLONE_CONFIG_R2_TYPE=s3 RCLONE_CONFIG_R2_PROVIDER=Cloudflare \
   RCLONE_CONFIG_R2_ENDPOINT="$(grep ^BACKUP_R2_ENDPOINT= .env.production | cut -d= -f2-)" \
   RCLONE_CONFIG_R2_ACCESS_KEY_ID="$(grep ^BACKUP_R2_ACCESS_KEY_ID= .env.production | cut -d= -f2-)" \
   RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$(grep ^BACKUP_R2_SECRET_ACCESS_KEY= .env.production | cut -d= -f2-)" \
   rclone ls "R2:$(grep ^BACKUP_R2_BUCKET= .env.production | cut -d= -f2-)"
   ```
5. **Schedule it** with the provided systemd units:
   ```sh
   sudo cp deploy/systemd/batibudget-db-backup.service /etc/systemd/system/
   sudo cp deploy/systemd/batibudget-db-backup.timer /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now batibudget-db-backup.timer
   systemctl list-timers batibudget-db-backup.timer   # confirm next run
   ```
   (The unit files assume the repo is at `/home/deploy/budget_construction`
   and run as user `deploy`; edit them if your paths differ.) A plain cron
   entry calling the script daily works too if you prefer cron over systemd.
6. **Documents mirror, separately:** create a dedicated
   `budget-construction-documents-backup` bucket, an API token scoped to
   Object Read & Write on **only** the live documents bucket + this mirror
   bucket, an Object Lifecycle Rule on the mirror bucket (30-day age-based
   expiration -- Settings → Object Lifecycle Rules → Add rule on the mirror
   bucket), then fill the `DOCS_BACKUP_R2_*` values in `.env.production`, run
   `./scripts/backup_documents.sh` by hand once and confirm with `rclone ls`
   the same way as step 4, then enable
   `deploy/systemd/batibudget-docs-mirror.{service,timer}` the same way as
   step 5.

### Restore procedure

To restore a backup into a database, use `scripts/restore_db.sh`. For a real
recovery you restore into a **fresh, empty** database (a new `postgres_data`
volume), then bring the app up against it.

```sh
cd ~/budget_construction
# Restore the latest local backup into the production database name.
# (Target must be empty; add --create if the database does not exist yet.)
./scripts/restore_db.sh backups/db-<UTC>.sql.gz.enc --yes

# Or pull a specific backup straight from R2 first:
./scripts/restore_db.sh --from-r2 db-<UTC>.sql.gz.enc --yes
```

Full VPS-loss recovery outline: provision + harden a new server (Chunks 2-3),
clone the repo, recreate `.env.production` from your password manager
(including `BACKUP_ENCRYPTION_PASSPHRASE`), `docker compose ... up -d db`,
`./scripts/restore_db.sh --from-r2 <latest> --create --yes`, then start
`migrate`/`backend`/`frontend`/`caddy`. R2 document files are untouched by a
VPS-loss outage and need no restore in that scenario.

**Recovering a single deleted/overwritten document** (not a VPS-loss
scenario -- an accidental or malicious delete of one R2 object): the object
still exists in the mirror bucket (`DOCS_BACKUP_R2_BUCKET`) until its
lifecycle rule expires it. Copy it back manually, e.g.:
```sh
RCLONE_CONFIG_R2_TYPE=s3 RCLONE_CONFIG_R2_PROVIDER=Cloudflare \
RCLONE_CONFIG_R2_ENDPOINT="$(grep ^DOCS_BACKUP_R2_ENDPOINT= .env.production | cut -d= -f2-)" \
RCLONE_CONFIG_R2_ACCESS_KEY_ID="$(grep ^DOCS_BACKUP_R2_ACCESS_KEY_ID= .env.production | cut -d= -f2-)" \
RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$(grep ^DOCS_BACKUP_R2_SECRET_ACCESS_KEY= .env.production | cut -d= -f2-)" \
rclone copy "R2:$(grep ^DOCS_BACKUP_R2_BUCKET= .env.production | cut -d= -f2-)/<object-key>" \
  "R2:$(grep ^R2_BUCKET_NAME= .env.production | cut -d= -f2-)/"
```
The `<object-key>` is the document's `file_path` column in the `documents`
table (or the equivalent for a permanently-deleted row, from a database
backup taken before the deletion).

### Restore validation

The backup-and-restore cycle was verified end-to-end on 2026-07-13 against a
full copy of a populated database (dev stack, 14 tables incl. `users`,
`projects`, `transactions`, `budget_lines`, `refresh_tokens`): a backup was
taken, restored into a scratch database, and every table matched the original
row-for-row. A restore with the wrong passphrase was confirmed to fail loudly
(non-zero exit, no partial/garbage load) rather than silently corrupt.

**Production validation completed 2026-07-13.** The dedicated
`budget-construction-backups` R2 bucket and a bucket-scoped API token were
created, rclone installed, and `.env.production` filled with the `BACKUP_*`
settings (passphrase saved off-VPS in the password manager). A real backup
was taken and confirmed present in R2 via `rclone ls`. A full restore drill
was then run **pulling that backup back down from R2** (not the local copy)
into a scratch `restore_drill` database on the VPS; `users` row counts
matched the live production database exactly, and the scratch database was
dropped afterward. `batibudget-db-backup.timer` is installed and enabled
(`systemctl list-timers` confirms it, next run 2026-07-14 03:31 UTC). The
backup system is fully operational: encrypted, off-host, scheduled, and its
restore path proven against production data.


## Chunk 1 Result (2026-07-10)

### 1. Files changed

- Added `docker-compose.prod.yml` with production-only PostgreSQL, one-shot
  Alembic migration, FastAPI, frontend asset-build, and Caddy services. Only
  Caddy exposes ports `80` and `443`; all service logs use Docker's bounded
  local log driver.
- Added `Caddyfile` for automatic HTTPS, static SPA fallback, security
  response headers, and `/api` prefix stripping before proxying to FastAPI.
- Updated `backend/Dockerfile` to install runtime dependencies only, run as a
  non-root user, and use the production FastAPI runner with two workers;
  added `backend/.dockerignore`.
- Updated `frontend/Dockerfile` with retained `development`, `build`, and
  `assets` stages. The existing development Compose file now explicitly targets
  the development stage, preserving the local workflow.
- Added `.env.production.example`; corrected the Vite variable and documented
  local CORS/configuration in `.env.example`; protected production env and
  backup artifacts in `.gitignore`.
- Added strict production settings validation plus `/health/live` and
  database-backed `/health/ready` endpoints in the backend. These are
  operational configuration only; no domain/business behavior changed.
- Replaced the empty `README.md` with local development, production,
  configuration, validation, backup/restore, upgrade, and rollback guidance.

### 2. Production architecture

`caddy` is the sole public container. It obtains and stores Let's Encrypt state
in named volumes, serves the React build from the `frontend_assets` volume, and
forwards `/api/*` to the internal FastAPI service after removing `/api`.

`db` stores PostgreSQL data in `postgres_data` and must pass `pg_isready`.
`migrate` runs `alembic upgrade head` exactly once after that check; `backend`
starts only after it succeeds and exposes liveness/readiness checks for Caddy
and operations. The backend connects outward to R2 and Resend over HTTPS.

### 3. Remaining manual VPS steps

1. Provision and harden the Hetzner Ubuntu server, install Docker/Compose,
   configure SSH access, firewall, updates, and Docker log rotation.
2. Point the production domain's A/AAAA records at the VPS and allow inbound
   TCP `80` and `443` before first Caddy startup.
3. Copy `.env.production.example` to the server as `.env.production`, replace
   every placeholder with real secret values, and set permissions to `600`.
   Verify the R2 credentials are bucket-scoped and the Resend sender domain is
   verified.
4. Run `docker compose --env-file .env.production -f
docker-compose.prod.yml config`, then `up -d --build`, and check the
   migration service, container health, TLS, application smoke tests, and
   public health endpoints.
5. Configure encrypted off-host PostgreSQL backups and retention, then perform
   and record a restore test before production acceptance.

### Validation performed

- `docker compose --env-file .env.production.example -f
docker-compose.prod.yml config --quiet` completed successfully (with
  `ENV_FILE=.env.production.example` for the checked-in example path).
- Backend Ruff and Python compilation checks passed, including production
  settings validation against `.env.production.example`.
- The frontend production build passed. Vite reported an existing advisory
  that the generated JavaScript bundle exceeds 500 kB; this is a performance
  follow-up and does not block deployment correctness.
- Production backend and frontend container images built successfully. No
  containers were started or deployed.

## Deployment History

| Date       | Version    | Description                                                                                                                                      |
| ---------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-07-10 | v1.0.0-rc1 | Release Candidate created. Production architecture reviewed, production repository prepared, database audit completed, security audit completed. |

| Date       | Version | Description                                                                                                                                            |
| ---------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-13 | rc1     | First production deployment: all containers running and healthy, database migrated, HTTPS live at batibudget.com. Chunks 5 (DNS/HTTPS polish) and 6 (smoke test) still pending. |
| 2026-07-13 | v1.0.0  | Chunks 5 and 6 completed: batibudget.fr/www redirect fixed to use Caddy-issued HTTPS instead of OVH's HTTP-only redirect; catalog and "Maison Plain-Pied" template seeded; first admin user created; production smoke test passed (core app flow, document upload/download via R2, email flows via Resend). Off-host database backups still outstanding. |
| 2026-07-13 | v1.1.0  | Rotating refresh-token auth deployed (commit `b348585`): short-lived in-memory access token + httpOnly `SameSite=Lax` refresh cookie, 30-day sliding session, atomic rotation with reuse-detection, server-side revocation on logout/password-reset. Migration `a1b2c3d4e5f6` (`refresh_tokens` table) applied cleanly; all containers healthy; health endpoints green. Also shipped: backend Dockerfile split into dev/prod stages and a dev-only cross-site cookie fix (no prod impact). Pre-deploy DB dump taken (on-host). Off-host backups still outstanding. |
| 2026-07-13 | v1.2.0  | Automated encrypted off-host database backups deployed (commit `bd5bab9`): dedicated R2 backups bucket + scoped token created, rclone installed, `.env.production` configured, `batibudget-db-backup.timer` enabled (daily 03:30 UTC + `Persistent=true`). Verified on the VPS: real backup uploaded and confirmed present in R2 via `rclone ls`; full restore drill pulling that backup back from R2 matched production `users` row count exactly. **Original launch punch list (backups, in particular) is now fully closed.** |
| 2026-07-13 | v1.3.0  | Backup failure alerting (commit `1f5cdf2`) and R2 documents mirror (commit `a95c858`) deployed. Any `backup_db.sh`/`backup_documents.sh` failure now emails `BACKUP_ALERT_EMAIL` via Resend (verified with a real accepted alert and a simulated-outage case). R2 has no native versioning (confirmed against current Cloudflare docs), so `scripts/backup_documents.sh` substitutes a daily one-way `rclone copy` (never `sync`) of the live documents bucket into a dedicated `budget-construction-documents-backup` mirror bucket, retained via a 30-day R2 Object Lifecycle Rule. VPS setup completed: mirror bucket + scoped token + lifecycle rule created, a real uploaded document confirmed mirrored (`Copied (server-side copy)`), `batibudget-docs-mirror.timer` enabled (daily 04:16 UTC, alongside the 03:33 DB backup). **Closes the original Chunk 0 audit's open R2 lifecycle/retention item.** |
| 2026-07-14 | v1.3.1  | Fixed `www.batibudget.com`, unresolved since Chunk 4: its DNS still pointed at an OVH redirect/parking IP that reset the TLS handshake (perceived as the site "crashing"), and Caddy had no site block for the host regardless. Added it to the existing `.fr` redirect block (commit `5189774`), project owner repointed DNS at the VPS in OVH, deployed with `--force-recreate caddy`. Verified: `301` to `https://batibudget.com/` then `200`, valid certificate. |
| 2026-07-14 | v1.4.0  | Sentry error monitoring deployed (commit `801a1a2`): unhandled exceptions are caught, logged, and reported with user context via a generic exception handler; healthcheck requests filtered out of the access log. Verified with real test exceptions in both `development` and `production` Sentry environments after a `.env.production` DSN + backend rebuild. Incidental fix: `gitleaks-action` CI was failing on an unauthenticated GitHub API rate limit (not a real secret leak); fixed by passing `GITHUB_TOKEN` to the step. |
|            |         |                                                                                                                                                             |

## Production Configuration Review (2026-07-13)

Post-launch review of environment variables, secrets, PostgreSQL, R2, CORS,
HTTPS, Docker, and logging, with a focus on dev/prod separation. Repository
review only; no application or deployment files were changed except this
entry and a broken README link (see below).

### Confirmed correct — no action needed

- **Secrets never committed.** `.env` and `.env.production` are `.gitignore`d
  (`.gitignore:14-16`) and have no history in `git log --all`. `gitleaks`
  runs on every push/PR (`.github/workflows/secret-scan.yml`).
- **CORS.** Dev defaults to localhost-only origins
  (`backend/app/core/settings.py:22-29`); production requires an explicit
  `CORS_ALLOWED_ORIGINS` and fails startup otherwise
  (`validate_production_configuration`, same file, lines 36-66).
- **Production settings validation.** Startup fails clearly if any required
  production secret is missing, `APP_URL` isn't `https://`, or
  `DATABASE_ECHO=true` — no silent fallback to insecure defaults.
- **Docker isolation.** `docker-compose.prod.yml` exposes only Caddy's
  `80`/`443`; `db` and `backend` have no host ports. `db` has a
  `pg_isready` health check, `backend` has an HTTP liveness health check,
  `migrate` runs once and gates `backend` startup. All three use the bounded
  `local` log driver (10 MB × 3), consistent with the daemon-level rotation
  set up in Chunk 3.
- **Image separation.** `backend/Dockerfile` runs as a non-root user with a
  production ASGI command (no dev/reload server). `frontend/Dockerfile` has
  distinct `development`/`build`/`assets` stages; the dev Compose file pins
  `target: development` and the prod Compose file pins `target: assets` —
  the dev and prod images share no runtime code path.
- **Firewall.** UFW allows only SSH/80/443 (Chunk 3); `backend:8000` was
  confirmed unreachable from the public internet (Chunk 4).
- **R2 object keys** use `uuid4` filenames (`backend/app/routers/documents.py:169`),
  so accidental key collisions between environments are not a concern —
  bucket-level separation (below) is what matters.

### Findings

| Severity | Area | Finding | Recommendation |
| --- | --- | --- | --- |
| **High** | Dev/prod separation | The local root `.env` holds what appear to be **live, non-sandboxed** R2 and Resend credentials (real access keys, real `RESEND_API_KEY`), not dedicated dev/test ones. `backend/app/services/storage.py` has no environment-prefixing — a bug or accidental script run in local dev could write to, list, or delete objects in whatever bucket that key can reach, and/or send real email through the same Resend account. GitHub Actions already does this correctly (fake `test-bucket`/`test`/`test` credentials in `backend-tests.yml`); local dev does not. | Provision a dedicated dev-tier R2 bucket + a token scoped only to it, and use a Resend sandbox/test key (or a clearly separate low-volume sending identity) for local `.env`. Separately, confirm on the VPS that `.env.production`'s `R2_BUCKET_NAME` differs from the local `.env`'s `budget-construction-documents` — don't paste the value into chat, just diff/grep on the server per the Chunk 4 lesson learned. |
| **High** | Backups | Off-host encrypted PostgreSQL backups with a tested restore are still not scheduled (carried over from Chunk 6). `README.md` documents the manual `pg_dump` command but nothing runs it automatically. | Highest-priority remaining item before this is fully production-safe — schedule it (cron + off-host target) and record a restore test in the "Disaster Recovery" section below, which is still a placeholder. |
| **Medium** | Logging | `backend/app/main.py:38,42` and `backend/app/db/session.py:17` use bare `print()` for startup/shutdown and dump a raw query result to stdout, instead of the `logging` module used everywhere else (e.g. `main.py:69`). No log-level configuration exists, so verbosity can't be tuned per environment, and `print()` output has no timestamp/module context, which limits the usefulness of the 10 MB × 3 log rotation for postmortems. | Route the lifespan/init-db messages through `logging` at an appropriate level (`info`), and consider a basic `logging.basicConfig` keyed off `APP_ENVIRONMENT`. Not urgent, but cheap to fix. |
| **Low** | Docs | `README.md:39` links to `docs/architecture/deployment_runbook.md`, which doesn't exist — the actual file is `production_deployment_runbook.md`. | Fixed as part of this review (see below). |
| **Low** | Config hygiene | Local `.env`'s `POSTGRES_PASSWORD` and `ACCESS_TOKEN_EXPIRE_MINUTES=10080` (1 week) are dev-only choices that would be weak if ever copied verbatim into `.env.production`. Chunk 4 notes the production `POSTGRES_PASSWORD`/`SECRET_KEY` were independently generated, so this is not currently a live issue. | No action needed now; worth a quick confirmation that production's `ACCESS_TOKEN_EXPIRE_MINUTES` wasn't also copied from the dev value. |
| **Low** | `SECRET_KEY` validation | Production validation only checks `SECRET_KEY` is non-empty, not that it has meaningful length/entropy (`settings.py:41-58`). | Optional: add a minimum-length check (e.g. ≥32 chars) so a short placeholder can't accidentally pass validation in the future. |
| **Informational** | Known open items | `analytics/sql/` duplication (repo root vs `backend/analytics/sql/`, Chunk 4) and `www.batibudget.com` still showing OVH's placeholder page (Chunk 4) remain unresolved from earlier chunks — no change since last recorded. | Carried forward; no new recommendation beyond what's already recorded above. |

### Follow-up (2026-07-13, same day)

Decisions and fixes made after the review above, before moving on to the
next task:

- **Dev/prod R2 & Resend separation (High) — R2 half closed 2026-07-14;
  Resend intentionally not separated.** The project owner decided Resend
  mixing dev/prod emails is acceptable and does not want it separated — that
  part of this item is closed as "won't do," not outstanding. R2 was
  separated: confirmed local dev `.env` was using the exact same bucket
  (`budget-construction-documents`, same account) as production, not just a
  similarly-named one. Created a dedicated `budget-construction-documents-dev`
  bucket and an API token scoped to **only** that bucket, updated local
  `.env` (production untouched). **Lesson learned:** the first token's
  secret was copied truncated (32 chars instead of the expected 64),
  producing a `SignatureDoesNotMatch` error that manifested as a 502 in the
  app — since Cloudflare shows a token secret exactly once, a bad copy
  requires creating a fresh token, not fixing the old one. Also relearned
  mid-fix: `docker compose restart` does **not** reload `env_file` values
  into a running container (it reuses the environment baked in at container
  creation) -- `docker compose up -d` (or `--force-recreate`) is required
  after any `.env` change, matching the exact same class of lesson already
  documented for `Caddyfile` bind-mount changes. Verified with a full
  upload/head/delete round trip directly against the dev bucket via the
  app's own `storage.py` functions, then confirmed again through the real
  app UI.
- **Backup schedule retimed for both users' timezones (2026-07-14).** The
  project owner is in France, the app's user is in Guadeloupe (UTC-4, no
  DST). Backup timing has no correctness/performance reason to avoid usage
  windows -- `pg_dump` takes a consistent MVCC snapshot without blocking
  reads or writes, and the tiny database dumps in well under a second -- but
  moved anyway for peace of mind, at zero cost. `batibudget-db-backup.timer`
  moved from 03:30 to **06:00 UTC** (= 2am Guadeloupe every day of the
  year, since Guadeloupe has no DST) and `batibudget-docs-mirror.timer`
  from 04:15 to **06:45 UTC**, preserving the original 45-minute gap
  between the two jobs. Requires re-copying the updated unit files to
  `/etc/systemd/system/` on the VPS, `daemon-reload`, and restarting both
  timers to recompute their next elapse time (a plain `daemon-reload` alone
  does not do this).
- **Backups (High) — implemented and fully deployed 2026-07-13.** Automated
  encrypted PostgreSQL backups to Cloudflare R2 with retention, plus a tested
  restore path (`scripts/backup_db.sh`, `scripts/restore_db.sh`, systemd
  units under `deploy/systemd/`). Verified end-to-end both locally
  (row-for-row match; wrong-passphrase fails loudly) and on the VPS itself
  (real R2 upload confirmed via `rclone ls`; a restore drill pulling the
  backup back down from R2 matched production row counts exactly).
  `batibudget-db-backup.timer` is enabled, next run 2026-07-14 03:31 UTC.
  **Failure alerting added same day:** any backup failure emails
  `BACKUP_ALERT_EMAIL` via the app's existing Resend config; verified with a
  real accepted alert and a simulated-Resend-outage case that still exits
  non-zero without masking the original error. No further action needed;
  see "Disaster Recovery" above for the full plan.
- **New finding (Low) — local dev `.env` contains real production backup
  credentials — fixed same day.** While testing the alert path,
  `BACKUP_ENCRYPTION_PASSPHRASE` and the real `BACKUP_R2_*` values (matching
  production) were found copied into the local development machine's root
  `.env`. No harm occurred (`rclone` isn't installed on that machine, so no
  network call was possible); the project owner removed the lines from the
  local `.env` immediately after this was flagged. The broader dev/prod R2 &
  Resend credential-separation item (app-level, not backup-specific) remains
  sidelined per the project owner's earlier call.
- **R2 documents bucket lifecycle/retention (open since Chunk 0
  audit) — closed 2026-07-13.** R2 has no native object/bucket versioning
  (verified against current Cloudflare docs/release notes), so the original
  plan to enable versioning + noncurrent-version expiration was not possible
  as such. Substituted `scripts/backup_documents.sh`: a daily one-way
  `rclone copy` (never `sync`, so it never deletes from the destination) of
  the live documents bucket into a dedicated mirror bucket, with retention
  enforced by an R2-native Object Lifecycle Rule on the mirror bucket. See
  "Documents mirror" under Disaster Recovery above for the full design and
  the "New finding" note above for what was double-checked before landing on
  this approach. **VPS setup completed and validated same day:** the
  `budget-construction-documents-backup` bucket, scoped token, and 30-day
  Object Lifecycle Rule were created; `DOCS_BACKUP_R2_*` filled in
  `.env.production`; a real document was uploaded through the live app and
  confirmed present in the mirror bucket after running the script
  (`rclone` log showed `Copied (server-side copy)`, confirming no VPS
  bandwidth/disk is used for the transfer); `batibudget-docs-mirror.timer`
  is enabled (`systemctl list-timers` confirms it alongside the DB backup
  timer, next run 2026-07-14 04:16 UTC). This closes the item.
- **`www.batibudget.com` unresolved redirect (open since Chunk 4) — closed
  2026-07-14.** Diagnosed with `dig`/`curl -v`: the `www` A record still
  pointed at an OVH IP (`213.186.33.5`, the same OVH redirect/parking
  service already identified as broken for `batibudget.fr` in Chunk 5),
  which reset the TLS handshake outright rather than serving anything --
  this is what the project owner saw as the site "crashing." Also, the
  Caddyfile had no site block for this host at all, so even correct DNS
  wouldn't have produced a redirect. **Fix (commit `5189774`):** added
  `www.batibudget.com` to the existing `batibudget.fr`/`www.batibudget.fr`
  redirect site block; validated with `caddy validate` against the real
  `caddy:2-alpine` image before deploying. **DNS fix (project owner, OVH
  dashboard):** removed the OVH web-redirection entry for `www` and pointed
  its A/AAAA records directly at the VPS, same pattern as the `.fr` fix.
  **Deployed** with `docker compose ... up -d --force-recreate caddy` (per
  the Chunk 5 bind-mount-inode lesson -- plain `restart`/`reload` would not
  have picked up the Caddyfile change). Verified end-to-end:
  `https://www.batibudget.com` now returns `301` to `https://batibudget.com/`
  then `200`, with a valid Caddy-issued certificate.
- **Logging (Medium) — fixed.** `backend/app/main.py` and
  `backend/app/db/session.py` no longer use `print()`. `main.py` now calls
  `logging.basicConfig` with level `DEBUG` in non-production and `INFO` in
  production (keyed off `APP_ENVIRONMENT`), and both files log through the
  `logging` module instead.
- **`SECRET_KEY` validation (Low) — fixed.** `validate_production_configuration`
  in `backend/app/core/settings.py` now rejects a production `SECRET_KEY`
  shorter than 32 characters. Verified: a 5-character key raises
  `ValueError` at startup; a 64-character key passes.
- **Config hygiene / `ACCESS_TOKEN_EXPIRE_MINUTES` (Low) — verified, not a bug.**
  Checked directly on the VPS (`grep ACCESS_TOKEN_EXPIRE_MINUTES
  ~/budget_construction/.env.production`): production is set to `30`
  minutes, not copied from the local `.env`'s `10080`. However, 30 minutes
  combined with the current auth model (JWT access token in browser
  `localStorage`, no refresh token, no server-side revocation — see
  `frontend/src/auth/tokenStorage.ts` and `backend/app/routers/auth.py`)
  forces frequent re-logins with no path to a longer session without
  weakening security further. **Decision:** implement a proper refresh-token
  flow (short-lived in-memory access token + rotating httpOnly-cookie
  refresh token, 30-day sliding session, DB-backed revocation and reuse
  detection) to get both a long session and a shorter-lived, revocable
  access token.

  **Implemented same day.** `POST /auth/login` now also issues a rotating
  refresh token as an `httpOnly`/`SameSite=Lax` cookie (`Secure` in
  production only); the JWT access token stays at 30 minutes and is kept
  in-memory on the frontend instead of `localStorage`. New endpoints:
  `POST /auth/refresh` (rotates the refresh token, returns a new access
  token) and `POST /auth/logout` (revokes it). Refresh tokens are opaque
  random values stored hashed (SHA-256) in a new `refresh_tokens` table
  (migration `a1b2c3d4e5f6`), grouped by a `family_id`; reusing an
  already-rotated-out or revoked token revokes the whole family (theft
  signal), and a password reset revokes all of a user's refresh tokens.
  `REFRESH_TOKEN_EXPIRE_DAYS` (default 30) is documented in both env
  examples. Verified: migration applied cleanly against the dev Postgres
  container; full backend suite (186 tests, including 7 new refresh-token
  tests covering rotation, reuse-detection, logout, and password-reset
  revocation) and `ruff check` pass; frontend `tsc -b && vite build`
  passes; manual `curl` smoke test against the running dev stack confirmed
  login sets the cookie, refresh rotates it, reuse revokes the family,
  logout revokes it, and cross-origin CORS/credentials headers
  (`localhost:5173` → `localhost:8000`) are correct. Not verified in an
  actual browser (no browser-automation tool available in this session) —
  recommend a manual click-through of login/idle/refresh/logout before
  relying on this in production.

  **Concurrency bug found and fixed during testing.** The first browser
  test logged the user out on page reload. Root cause: React `StrictMode`
  double-invokes effects in dev, firing two concurrent `POST /auth/refresh`
  calls with the same cookie; the rotation logic used a non-atomic
  read-then-write, so one request's failure tripped reuse-detection and
  revoked the whole family — including the other request's freshly issued
  token. This would also occur in production with two browser tabs sharing
  the cookie, so it was fixed at the root: rotation now claims the token via
  an atomic conditional `UPDATE ... WHERE revoked_at IS NULL`, with a
  10-second reuse grace window (a token reused within 10s of its own
  rotation is treated as a concurrent legitimate request, not theft). A new
  `revoked_reason` column ensures the grace window applies only to
  rotation-revoked tokens — an explicit logout or password reset is never
  silently forgiven. The frontend mount-bootstrap is also `useRef`-guarded
  against StrictMode's double-invoke (defense in depth). Re-verified with a
  live 5×-repeated concurrent-request race against the dev server (all
  succeed, no lockout) and the backend suite is now 187 tests. Total
  auth-related pyright/ruff clean.

- **Dev Dockerfile broke on rebuild (found while testing above) — fixed.**
  Forcing a real dev image rebuild surfaced a latent breakage:
  `backend/Dockerfile` had been reworked into a production-only image during
  Chunk 4 (non-root `USER app`, `--no-dev`, Python under `/app/.uv-python`,
  `fastapi run`), but the dev `docker-compose.yml` reuses that same
  Dockerfile with a `./backend:/app` bind mount, which shadows the managed
  Python and collides with the non-root venv → `Permission denied` on
  `/app/.venv/bin/python3`. It had stayed hidden because the old pre-Chunk-1
  image was still cached and running (hot-reloading bind-mounted source).
  **Fix:** split `backend/Dockerfile` into a `development` stage (full deps,
  root, uv-managed Python under `/root` so the bind mount doesn't shadow it,
  `fastapi dev` with hot reload) and a `production` stage (unchanged from
  before, kept **last** so no-target builds still resolve to it — so
  `docker-compose.prod.yml` is untouched and prod behavior is unchanged).
  `docker-compose.yml` now sets `target: development` on the backend. This
  mirrors the frontend Dockerfile's existing multi-stage pattern.
  **Rebuild note:** the stale `backend_venv` named volume had to be removed
  (`docker volume rm budget_construction_backend_venv`) so it repopulates
  from the new image; `db_data` was left untouched. Verified: dev stack
  rebuilds and starts cleanly, DB data (incl. the refresh-token migration)
  survived, and login/refresh/concurrent-refresh all pass on the rebuilt
  stack. **Production impact:** none at build time (prod still builds the
  `production` stage by default), but the next prod deploy will rebuild from
  this Dockerfile — expected and safe.

## Production Logging & Error Reporting Review (2026-07-14)

Task: verify backend logging and error reporting are sufficient to
investigate unexpected exceptions without relying solely on user reports.

### Findings

- **Unhandled exceptions were already logged** (Starlette re-raises after
  its default handling, so uvicorn's error logger captured a traceback),
  but with two real gaps against the stated goal:
- **High — logs don't survive a deploy.** `docker-compose.prod.yml`'s
  `local` logging driver ties log storage to the specific container
  instance; every `up -d --build` (i.e. every feature deploy) recreates the
  container and discards its prior logs. Effective retention was "since the
  last deploy," not the nominal 10MB×3 window.
- **Medium — no proactive alerting on server errors.** No generic
  `Exception` handler, no notification; a bug would only surface via
  someone manually checking logs or a user reporting it -- the exact thing
  being avoided.
- **Medium — healthcheck noise.** `/health/live` polled every 15s
  (5,760 requests/day) generated constant access-log noise, diluting the
  (already deploy-truncated) log budget.
- **Low — no request correlation ID.**

### Decision

Project owner already runs Sentry for another project. Chosen: Sentry for
exception capture/alerting (persists independent of VPS/deploys, richer
context and dedup than a hand-rolled solution) + the healthcheck log filter
(cheap, orthogonal). Deferred: switching the Docker logging driver to
`journald` for *general* app logs (not just exceptions) -- only worth it if
routine log history (not just errors) needs to survive deploys later.

### Implementation

- `sentry-sdk` added (`backend/pyproject.toml`); `SENTRY_DSN` is an optional
  setting (`app/core/settings.py`) -- unset is a safe no-op, not a hard
  requirement, so a missing DSN never blocks the app from starting.
  `app/core/sentry.py::init_sentry()` calls `sentry_sdk.init()` only when
  a DSN is present, with `traces_sample_rate=0.0` (error capture only, no
  performance tracing for now) and `send_default_pii=False` (user context is
  attached explicitly and deliberately instead, see below).
- `app/main.py`: a generic `@app.exception_handler(Exception)` catches
  anything not already handled by the existing `StarletteHTTPException`/
  `RequestValidationError` handlers (Starlette dispatches by most-specific
  match, so those two are unaffected). It logs with full context, calls
  `sentry_sdk.capture_exception(exc)` explicitly, and returns the app's
  normal structured error body (`internal_server_error`) instead of a raw
  traceback. **Verified via web research before implementing:** Sentry's
  FastAPI/Starlette integration does NOT auto-capture an exception once a
  custom handler intercepts it -- the explicit `capture_exception` call is
  required, not optional.
- `app/dependencies/auth.py::get_current_user` calls
  `sentry_sdk.set_user({'id': ..., 'email': ...})` once a request is
  authenticated, so a captured exception shows which user was affected
  without needing them to report it. No-op when Sentry isn't initialized.
- `HealthCheckAccessLogFilter` (`app/main.py`) drops `/health/live` and
  `/health/ready` from the `uvicorn.access` logger by inspecting
  `record.args[2]` (verified this is the correct uvicorn access-log record
  shape via research before implementing, rather than assuming).
- 6 new tests (`tests/integration/test_error_handling.py`): unhandled
  exception returns a clean structured 500 (not a leaked traceback) and is
  actually sent to `sentry_sdk.capture_exception`; expected `HTTPException`s
  are confirmed to still route to their own handler, not this one (no
  collision); the log filter is tested directly for both excluded and
  included paths plus a defensive malformed-record case.
- **Testing note:** the exception-handler tests needed
  `ASGITransport(..., raise_app_exceptions=False)` -- Starlette's
  `ServerErrorMiddleware` sends the response and then re-raises the
  exception by design (so the ASGI server can still log it), which a real
  uvicorn-served client never sees, but httpx's `ASGITransport` surfaces to
  the test caller by default since there's no server absorbing it.

Full backend suite: 193 passed. `ruff`/`pyright` clean on all touched files.

### VPS deployment (2026-07-14)

A dedicated Sentry project was created for this app (not shared with the
project owner's other project). Before touching production, the DSN was
verified locally by sending a real test exception directly via `sentry_sdk`
from inside the dev backend container -- confirmed received, tagged
`environment: development`. `SENTRY_DSN` was then added to
`.env.production`, and the backend rebuilt (`up -d --build backend`; no
migration needed, this only adds a dependency). `/api/health/live` returned
`{"status":"ok"}` and the container reported healthy. A second test
exception was sent through the actual `init_sentry()` production code path
(not a standalone script) and confirmed received in the Sentry dashboard,
tagged `environment: production`. Closed.

Incidental fix same day: `gitleaks-action@v2` started failing CI
(`.github/workflows/secret-scan.yml`) with "missing gitleaks license" --
not a real secret leak, but the action's anonymous GitHub API call (to
check free-tier eligibility for public repos) hit a rate limit with no
token configured. Fixed by passing `GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}`
to the step; verified the next push's workflow run succeeded.
