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
- [ ] Chunk 5 — domain, DNS, and HTTPS configuration.
- [ ] Chunk 6 — production smoke test.

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
certificate successfully on the first attempt, no workaround needed. Two
related domains were also configured at this time, outside the runbook's
original scope: `batibudget.fr` and `www.batibudget.fr` now permanently
(301) redirect to `https://batibudget.com` via OVH's redirection product.
`www.batibudget.com` itself still shows OVH's default placeholder page —
Chunk 5 should decide whether it should also serve the app or redirect to
the apex domain.

## Deployment Commands

<!-- Placeholder for deployment commands. -->

## Rollback

<!-- Placeholder for rollback procedure. -->

## Disaster Recovery

<!-- Placeholder for the disaster-recovery plan: incident ownership,
backup locations and retention, recovery-time/recovery-point objectives,
database and R2 restoration procedures, and recovery validation. -->

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
|            |         |                                                                                                                                                             |
