# Bâti Budget

Bâti Budget is a React/Vite frontend backed by a FastAPI API,
PostgreSQL, Cloudflare R2 document storage, and Resend email delivery.

## Tech Stack

![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![Caddy](https://img.shields.io/badge/Caddy-1F88C0?style=for-the-badge&logo=caddy&logoColor=white)
![Cloudflare R2](https://img.shields.io/badge/Cloudflare_R2-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)

## Architecture

Local development uses `docker-compose.yml` with Vite and FastAPI reload.
Production uses `docker-compose.prod.yml`: Caddy is the only public container,
serving the built SPA and forwarding `/api/*` to FastAPI. PostgreSQL, FastAPI,
and the Alembic migration job remain on the Docker network. Documents live in
Cloudflare R2 rather than on the VPS.

## Local development

1. Copy `.env.example` to `.env` and replace the placeholder values.
2. Start the stack with `docker compose up --build`.
3. Open `http://localhost:5173`; the API is at `http://localhost:8000`.

The development stack intentionally exposes PostgreSQL on `localhost:5434` and
includes `db-test`; do not use it for production.

## Production deployment

Prerequisites: an Ubuntu 24.04 server with Docker Engine and the Compose
plugin, a domain whose A/AAAA records point at the server, and inbound ports
80/443 open. Follow the full operational checklist in
[`docs/architecture/production_deployment_runbook.md`](docs/architecture/production_deployment_runbook.md).

1. Clone the repository on the server and copy `.env.production.example` to
   `.env.production`. Set every placeholder with production values, then run
   `chmod 600 .env.production`.
2. Validate the resolved configuration without starting containers:

   ```sh
   docker compose --env-file .env.production -f docker-compose.prod.yml config
   ```

3. Build and start the production stack:

   ```sh
   docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
   ```

The one-shot `migrate` service applies Alembic migrations before the API
starts. Check it with `docker compose --env-file .env.production -f
docker-compose.prod.yml ps`; do not seed production data during deployment.

For a safe local configuration review before creating the secret file, use
`.env.production.example` in place of `.env.production` and prefix the command
with `ENV_FILE=.env.production.example`.

Only Caddy publishes ports 80 and 443. Do not add host mappings for PostgreSQL
or FastAPI.

## Production configuration

`.env.production` is a secret file and must never be committed. Important
settings are:

| Variable                                                 | Purpose                                                                      |
| -------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `DOMAIN`, `ACME_EMAIL`                                   | Caddy hostname and Let's Encrypt contact address.                            |
| `POSTGRES_*`, `DATABASE_URL`                             | Internal PostgreSQL credentials and async API connection URL.                |
| `APP_ENVIRONMENT=production`                             | Enables strict production configuration validation.                          |
| `SECRET_KEY`, `ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES` | JWT signing configuration; generate a high-entropy secret (≥32 characters).  |
| `REFRESH_TOKEN_EXPIRE_DAYS`                              | Sliding session length in days for the httpOnly refresh cookie (default 30). |
| `APP_URL`, `CORS_ALLOWED_ORIGINS`                        | Public HTTPS URL and JSON array of permitted browser origins.                |
| `R2_*`                                                   | Bucket-scoped Cloudflare R2 credentials.                                     |
| `RESEND_*`, `SUPPORT_EMAIL`                              | Verified Resend sender and issue-report recipient.                           |
| `VITE_API_BASE_URL=/api`                                 | Build-time, same-origin API path used by the browser.                        |

The API refuses to start with incomplete production settings, an empty CORS
allow-list, a non-HTTPS `APP_URL`, or `DATABASE_ECHO=true`.

## Authentication

Login (`POST /auth/login`) returns a short-lived JWT access token
(`ACCESS_TOKEN_EXPIRE_MINUTES`, default 30) in the response body, which the
frontend keeps in memory only (never `localStorage`), and sets a separate,
long-lived refresh token as an `httpOnly`, `SameSite=Lax` cookie
(`REFRESH_TOKEN_EXPIRE_DAYS`, default 30, sliding). `POST /auth/refresh`
exchanges a valid refresh cookie for a new access token and rotates the
refresh token; the previous one is invalidated. `POST /auth/logout` revokes
the current refresh token. If a rotated-out or already-revoked refresh token
is ever presented again, the entire session family is revoked as a
theft signal, not just that one token. Resetting a password revokes all of a
user's refresh tokens. Refresh tokens are stored hashed (SHA-256) in the
`refresh_tokens` table, never in plaintext.

## Validation and operations

After deployment, verify:

```sh
curl -fsS https://your-domain.example/api/health/live
curl -fsS https://your-domain.example/api/health/ready
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

Also test login, a browser refresh on a nested route, that the session
survives an access-token expiry (silent renewal via `/auth/refresh`), logout,
document upload and download, password reset delivery, and issue-report
email delivery.

Back up PostgreSQL daily to encrypted storage outside the VPS. A Docker volume
is not a backup. `scripts/backup_db.sh` streams an encrypted
(`pg_dump | gzip | openssl AES-256`) backup to `./backups` and off-host to a
Cloudflare R2 bucket, with retention pruning; `scripts/restore_db.sh` restores
one (optionally pulling it from R2). Any backup failure emails
`BACKUP_ALERT_EMAIL` via the app's existing Resend config, so a broken
nightly job doesn't go unnoticed. Configure the `BACKUP_*` variables in
`.env.production` (see `.env.production.example`) and schedule the backup with
the systemd units in `deploy/systemd/`. The full plan, one-time VPS setup, and
restore procedure are in the "Disaster Recovery" section of
[`docs/architecture/production_deployment_runbook.md`](docs/architecture/production_deployment_runbook.md).

```sh
./scripts/backup_db.sh                                   # backup now
./scripts/restore_db.sh backups/db-<UTC>.sql.gz.enc --yes  # restore
```

Test restores regularly on a separate database/container. R2 documents need a
separate lifecycle and retention policy.

## Upgrade and rollback

Before an upgrade, create and verify a database backup, record the currently
deployed Git revision, then pull the intended revision and run:

```sh
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

Inspect `migrate`, container health, and the public health endpoints before
accepting traffic. To roll back application code, return to the recorded Git
revision and run the same command. Do not roll back database migrations unless
the migration has an explicitly reviewed downgrade and a tested restore plan;
restore the database backup instead when required.
