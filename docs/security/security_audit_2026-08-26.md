# Security Audit & Remediation Plan — 2026-08-26

Pre-delivery security pass over the whole Bâti Budget application: FastAPI
backend, React/Vite frontend, Caddy/Docker production stack, backup tooling,
CI, and the live deployment at `batibudget.com`.

**Context.** The application is already in production on the Hetzner VPS and
is about to be handed to a paying customer. The risk profile is moderate
(single-tenant-ish budgeting tool, financial documents such as quotes,
invoices and supplier RIBs stored in R2), so the bar is "solid, not
perfect": no open doors, no known-vulnerable components, defence in depth
where it is cheap, and a repeatable process to keep it that way.

**Method.** Manual review of every router, the auth/security core, settings,
storage and email services, the frontend auth/API layer, Caddyfile,
Compose files, Dockerfiles, CI workflows, systemd units and backup scripts;
`pip-audit` and `npm audit` on the locked dependency trees; read-only probes
of the live site (`HEAD /`, `GET /api/docs`, `GET /api/openapi.json`,
`OPTIONS /api/auth/register`, DNS). No write, login, or registration was
attempted against production.

---

## 1. Executive summary

The foundations are good: the auth design (short-lived in-memory access
token, rotated + hashed refresh tokens with reuse detection, HMAC-bound
single-use reset tokens), consistent per-user scoping in every repository,
admin gating on catalog/template mutation, magic-byte file validation with
UUID object keys and 5-minute presigned URLs, no raw SQL with user input,
escaped email templates, a non-root backend container, an internal-only
database, secrets kept out of git with a gitleaks CI job, encrypted
off-host backups, and a hardened VPS (key-only SSH, UFW, unattended
upgrades).

Five things must be fixed before the hand-over, in this order:

| # | Finding | Severity |
|---|---------|----------|
| S-01 | `POST /api/auth/register` is live and public. The frontend has no sign-up page, so anyone who reads the (also public) OpenAPI schema can create an account on the customer's product. | **High** |
| S-03 | No rate limiting or lockout on `/auth/login`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/refresh`, `/contact-requests`. Enables credential stuffing, reset-email spam through the Resend account, and cheap CPU exhaustion via bcrypt on a 2-vCPU VPS. | **High** |
| S-04 | Known-vulnerable dependencies in production: `starlette 1.0.0` (7 advisories incl. request-handling DoS), `python-multipart 0.0.29` (3), `cryptography 48.0.0` (4), `pyasn1`, `pydantic-settings`; frontend `react-router 7.18.1`. | **High** |
| S-02 | Swagger UI and the OpenAPI schema are served publicly in production (`/api/docs`, `/api/openapi.json` → 200). | Medium |
| S-05 | No HSTS, CSP, `frame-ancestors`/`X-Frame-Options`, `Permissions-Policy`, or `Cache-Control: no-store` on API responses. | Medium |

Everything else is hardening and process (sections 3–4). Total estimated
effort for the P0 + P1 work: roughly 2–3 working days including testing
and the production rollout.

### Remediation status

Updated as fixes land on `main`. "Fixed" means merged and covered by
tests/validation; the **VPS** column says what is still needed on the
running server (see section 5) — nothing is live until that is done.

| ID | Finding | Status | VPS step |
|----|---------|--------|----------|
| S-01 | Public self-registration | ✅ Fixed — route removed; `POST /admin/users` + invite email; `app.scripts.create_admin` CLI | Deploy WP-1 |
| S-02 | API docs exposed in prod | ✅ Fixed — `docs_url`/`openapi_url` off in production + Caddy 404 | Deploy WP-1 + Caddy reload |
| S-03 | No rate limiting | ✅ Fixed — slowapi per-IP limits, per-account lockout, per-address reset cap; `rate_limited` error code | Deploy WP-1 |
| S-04 | Vulnerable dependencies | ✅ Fixed — starlette 1.6, python-multipart 0.0.32, cryptography 50, pyasn1 0.6.4, pydantic-settings 2.15, fastapi 0.141; frontend `npm audit` clean | Deploy WP-1/WP-2 |
| S-05 | Missing security headers | ✅ Fixed — HSTS, CSP (Report-Only), X-Frame-Options, Permissions-Policy, COOP, `no-store` on `/api` | Caddy reload; enforce CSP after the Report-Only week (S-05b) |
| S-06 | No edge body-size limit | ✅ Fixed — Caddy `request_body max_size 25MB`; 413 mapped in the SPA | Caddy reload |
| S-07 | Email change without re-auth | ✅ Fixed — `current_password` required, sessions revoked, old address notified | Deploy WP-1 |
| S-08 | python-jose / ecdsa | ✅ Fixed — PyJWT, symmetric algorithms only; `pip-audit` clean | Deploy WP-1 |
| S-09 | Client IP not propagated | ✅ Fixed — `FORWARDED_ALLOW_IPS=*` on the backend service | `up -d` recreates backend |
| S-10 | No security event logging | ✅ Fixed — `security` logger emits `login_failed/success`, `login_locked`, `refresh_reuse_detected`, `password_reset_*`, `email_changed`, `admin_user_*`, `rate_limited` with IP | Deploy WP-1 |
| S-11 | Password policy | ✅ Fixed — shared `Password` type: 12–72 bytes, no surrounding whitespace, enforced on reset/create/CLI and mirrored in the SPA | Deploy WP-1/WP-2 |
| S-12 | Public repository | ⏳ Pending — needs the repo owner to flip visibility on GitHub | — |
| S-13 | Email sent to Sentry | ✅ Fixed — `set_user` sends the user id only | Deploy WP-1 |
| S-14 | Issue-report attachments | ✅ Fixed — content sniffed against the PNG/JPEG/PDF/HEIC allow-list, 20 MB total cap, 5 000-char description | Deploy WP-1 |
| S-15 | Access tokens survive password reset | ✅ Fixed — tokens carry a password-hash marker checked on every request | Deploy WP-1 |
| S-16 | Container hardening | ⏳ Pending | — |
| S-17 | Least-privilege DB role | ⏳ Pending | — |
| S-18 | CORS tightening | ⏳ Pending | — |
| S-19 | Refresh-cookie path | ⏳ Pending | — |
| S-20 | Dependency automation | ⏳ Pending | — |
| S-21 | Cross-user authorization tests | ⏳ Pending | — |
| S-22 | Local `.env` credentials | ⏳ Pending — needs the owner to confirm/rotate | — |
| S-23 | Health endpoints | Accepted as-is | — |
| S-24 | Admin bootstrap | ✅ Fixed — `uv run python -m app.scripts.create_admin` documented in README | — |

---

## 2. What is already solid (keep as-is)

Listed so the customer-facing story is fair and so nobody "fixes" these.

- **Access tokens**: HS256 JWT, 30 min, `purpose` claim separates access
  and reset tokens (`backend/app/core/security.py`). Kept in memory only in
  the SPA, never in `localStorage` (`frontend/src/api/client.ts`,
  `frontend/src/auth/AuthProvider.tsx`).
- **Refresh tokens**: `secrets.token_urlsafe(32)`, stored as SHA-256,
  rotated atomically on every use with a 10 s concurrency grace, family
  revocation on reuse, revoked on logout and password reset
  (`backend/app/services/auth.py`, `backend/app/repositories/refresh_token.py`).
  Cookie is `httpOnly`, `Secure` in production, `SameSite=Lax` — which also
  gives CSRF protection for the POST-only `/auth/refresh` and `/auth/logout`.
- **Password reset**: 15-minute JWT bound to an HMAC of the current password
  hash, so it is single-use and dies if the password changes; user id (not
  email) as subject; generic "if this email exists" response.
- **Passwords**: bcrypt via passlib; `UserCreate` caps at 72 bytes.
- **Authorization**: every project/supplier/transaction/document/trash/export
  query is filtered by `Project.user_id == current_user.id` (or
  `Supplier.user_id`), e.g. `backend/app/repositories/transaction.py:629-644`;
  cross-user access yields 404. `GET /users/{id}` returns 404 for anyone but
  self. Admin routes use a router-level `get_current_admin_user` dependency;
  `AdminUserUpdate` cannot set `is_admin`, so there is no privilege
  escalation path. Catalog/template mutation is admin-only.
- **Uploads**: extension allow-list + magic-byte sniffing + extension/content
  cross-check + 20 MB cap (`backend/app/services/document_validation.py`);
  object keys are `documents/user_<id>/…/<uuid4>.<ext>`; downloads are
  5-minute presigned URLs with a sanitised `Content-Disposition`.
- **Injection**: SQLAlchemy ORM throughout; the only `text()` calls are
  constants (`SELECT 1`, partial-index predicates, seed TRUNCATE). No
  `dangerouslySetInnerHTML`/`innerHTML`/`eval` in the frontend. Email HTML
  is built with `html.escape` on every user-controlled value.
- **Error handling**: uniform error envelope; unhandled exceptions return a
  generic 500 and go to Sentry with `send_default_pii=False`; 4xx never
  reaches Sentry.
- **Configuration**: production start-up refuses missing settings, a
  `SECRET_KEY` < 32 chars, non-HTTPS `APP_URL`, empty CORS list, or
  `DATABASE_ECHO=true` (`backend/app/core/settings.py`).
- **Infrastructure**: Caddy is the only published container; PostgreSQL and
  FastAPI are on the Docker network only; backend image runs as `app`
  (non-root); `.env*` excluded from images and git; `Server` header
  stripped; automatic HTTPS. VPS: key-only SSH, `PermitRootLogin no`, UFW
  22/80/443, `unattended-upgrades`, Docker log rotation.
- **Backups**: `pg_dump | gzip | openssl aes-256-cbc -pbkdf2` to a dedicated
  R2 bucket with a separate least-privilege token, daily via systemd, failure
  alerts by email; additive-only documents mirror.
- **CI**: Ruff, pytest against Postgres, an `alembic upgrade head` on an empty
  DB, and gitleaks on every push/PR.

---

## 3. Findings

Severity scale: **High** = fix before delivery; **Medium** = fix in the same
release or the one right after; **Low** = hardening/backlog.

### P0 — fix before delivery

#### S-01 · Public self-registration endpoint — High

`backend/app/routers/auth.py:46` exposes `POST /auth/register` with no
authentication, no invite token, and no feature flag. The SPA has no sign-up
route (`frontend/src/App.tsx`), the login page instead offers a
"contact the owner" form — i.e. the product is meant to be closed. Combined
with S-02, an attacker only needs to read the schema to create accounts,
then use the catalog, templates and their own projects, and hit every
authenticated endpoint (uploads to the customer's R2 bucket, issue-report
emails to the support mailbox, etc.).

*Live check:* `OPTIONS /api/auth/register` → 405 (route exists; no POST was
sent).

**Fix.** Remove the public route and replace it with an admin-only
`POST /admin/users` that creates the account and emails a password-reset
link (reuse `generate_password_reset_token` + `send_reset_password_email`),
so the admin never handles the user's password. Add
`ALLOW_SELF_REGISTRATION: bool = False` to `Settings` only if self-service
sign-up is a real future requirement; otherwise delete the route outright.
Seven test modules currently call `/auth/register`
(`grep -rl "'/auth/register'" backend/tests`); migrate them to the
`create_user` helper pattern already used in
`backend/tests/integration/test_auth_security.py`.

#### S-03 · No brute-force / abuse protection on public endpoints — High

None of `/auth/login`, `/auth/forgot-password`, `/auth/reset-password`,
`/auth/refresh`, `/contact-requests` has any rate limit, lockout, delay, or
CAPTCHA. The contact form has only a honeypot field. DNS points straight at
the Hetzner IP (OVH nameservers, no Cloudflare proxy/WAF in front), so
nothing upstream mitigates this either.

Consequences: unlimited password guessing per account; unlimited reset
emails to any address through the customer's Resend account (deliverability
and quota damage, plus a phishing-looking flood to a victim); unlimited
contact-form emails to the support mailbox; and each login attempt costs a
bcrypt verification (~100–250 ms CPU), so a few hundred requests per second
saturate the 2-vCPU VPS.

**Fix (application level, recommended).** Add `slowapi` with a limiter keyed
on the real client IP (see S-09) and apply per-route limits:

| Route | Limit |
|-------|-------|
| `POST /auth/login` | 5/minute and 30/hour per IP; additionally 10/hour per email (in-memory or `refresh_tokens`-style table) |
| `POST /auth/forgot-password` | 3/minute per IP and 3/hour per email |
| `POST /auth/reset-password` | 5/minute per IP |
| `POST /auth/refresh` | 30/minute per IP |
| `POST /contact-requests` | 3/hour per IP |
| `POST /issue-reports` | 10/hour per user |

Return 429 with the existing error envelope (`code: rate_limited`) and map
it in `ERROR_MESSAGES_FR`. With two uvicorn workers the in-memory store is
per-process, so effective limits are ~2× the configured value — acceptable
here; note it in the code. Log every 429 and every failed login (S-10).

*Alternative:* Caddy's `rate_limit` module needs a custom-built image
(`xcaddy`), which adds a build step and an image to maintain; putting the
site behind Cloudflare's proxy (the account already exists for R2) would add
a WAF and rate limiting without code changes but is a DNS/ops change with
its own trade-offs (Cloudflare terminates TLS). Either is a valid P2
addition; neither replaces the application-level limits.

#### S-04 · Known-vulnerable dependencies — High

`pip-audit` against `uv.lock` (production group only):

| Package | Locked | Advisories | Fixed in |
|---------|--------|-----------|----------|
| `starlette` | 1.0.0 | PYSEC-2026-161, -248, -249, -2280, -2281 | 1.3.1 |
| `python-multipart` | 0.0.29 | PYSEC-2026-3036, -3037, -3040 | 0.0.31 |
| `cryptography` | 48.0.0 | PYSEC-2026-3552/3553/3554, GHSA-537c-gmf6-5ccf | 50.0.0 |
| `pyasn1` | 0.6.3 | PYSEC-2026-3455/3456/3457 | 0.6.4 |
| `pydantic-settings` | 2.14.1 | GHSA-4xgf-cpjx-pc3j | 2.14.2 |
| `ecdsa` | 0.19.2 | PYSEC-2026-1325 (Minerva timing) | no fix — see S-08 |

Starlette and python-multipart parse untrusted request bodies on
unauthenticated endpoints (login form, contact JSON), so these are the ones
that matter.

`npm audit --omit=dev` (frontend):

| Package | Locked | Advisory | Note |
|---------|--------|----------|------|
| `react-router` / `react-router-dom` | 7.18.1 | GHSA-qwww-vcr4-c8h2 (RSC-mode CSRF) | not reachable in this SPA, but upgrade |
| `nanoid` | ≤3.3.17 | GHSA-28wg-ghj8-5hjv, GHSA-2v37-7h3g-55p8 | transitive, build-time |
| `postcss` | ≤8.5.22 | GHSA-fxqj-rqcc-2cmp, GHSA-r28c-9q8g-f849 | build-time only |

**Fix.** Backend: `uv lock --upgrade-package starlette --upgrade-package
python-multipart --upgrade-package cryptography --upgrade-package pyasn1
--upgrade-package pydantic-settings` (allow `fastapi` to move if its
Starlette pin requires it), run the test suite, rebuild. Frontend:
`npm audit fix` then `npm run build` and a quick smoke of routing. Then
make this recurring (S-20).

#### S-02 · API documentation exposed in production — Medium

`backend/app/main.py:79` constructs `FastAPI(lifespan=lifespan)` with
default `docs_url`/`redoc_url`/`openapi_url`; Caddy proxies `/api/*`
verbatim. Live: `GET /api/docs` → 200, `GET /api/openapi.json` → 200. This
hands an attacker the complete route list, schemas, admin routes, and
S-01.

**Fix.** In `main.py`:

```python
_is_prod = settings.app_environment == 'production'
app = FastAPI(
    lifespan=lifespan,
    docs_url=None if _is_prod else '/docs',
    redoc_url=None if _is_prod else '/redoc',
    openapi_url=None if _is_prod else '/openapi.json',
)
```

Also add a belt-and-braces rule in the Caddyfile (section 4, step 1) so the
schema stays hidden even if the setting regresses.

#### S-05 · Missing HTTP security headers — Medium

Live response headers on `/` and `/api/*` contain only
`X-Content-Type-Options` and `Referrer-Policy` (`Caddyfile:8-12`). Missing:
`Strict-Transport-Security`, `Content-Security-Policy` (incl.
`frame-ancestors`), `X-Frame-Options`, `Permissions-Policy`,
`Cross-Origin-Opener-Policy`, and `Cache-Control: no-store` on API
responses (which carry access tokens and financial data through any
intermediary cache).

**Fix.** Caddyfile:

```caddyfile
{$DOMAIN} {
	encode zstd gzip

	header {
		-Server
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
		X-Content-Type-Options "nosniff"
		X-Frame-Options "DENY"
		Referrer-Policy "strict-origin-when-cross-origin"
		Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
		Cross-Origin-Opener-Policy "same-origin"
		# Start in Report-Only for one release, then rename to Content-Security-Policy.
		Content-Security-Policy-Report-Only "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https://*.r2.cloudflarestorage.com; connect-src 'self'; frame-src https://*.r2.cloudflarestorage.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests"
	}

	@api path /api /api/*
	handle @api {
		header Cache-Control "no-store"
		# ...
	}
	# ...
}
```

Why these allowances: `frontend/src/index.css:1` imports Google Fonts;
`DocumentViewerDialog.tsx:110` renders R2 presigned URLs in an `<iframe>`
(and images may be shown via `<img>`); React inline `style` props (Toaster)
and Tailwind need `'unsafe-inline'` for styles — scripts stay strict. Verify
in the browser console during the Report-Only week that nothing legitimate
is reported, then enforce. Replace `https://*.r2.cloudflarestorage.com` with
the exact account endpoint host from `R2_ENDPOINT_URL` once enforced.

### P1 — same release or the next

#### S-06 · No request-size limit at the edge — Medium

Caddy passes bodies of any size to uvicorn; the 20 MB document cap and the
5 × 10 MB issue-report cap are enforced only after the whole body is read
into a spool file/memory, and unauthenticated endpoints (`/auth/login`,
`/contact-requests`) have no size bound at all.

**Fix.** In the `@api` handle: `request_body { max_size 25MB }`. The
frontend already shows "max. 20 Mo"; a 413 from Caddy should map to
`file_too_large` in `client.ts`' status fallback table.

#### S-09 · Real client IP is not propagated to the application — Medium (enabler)

uvicorn only trusts `X-Forwarded-For` from `127.0.0.1` by default; Caddy
reaches the backend from a Docker-network address, so `request.client.host`
is Caddy's IP for every request. Any per-IP rate limit (S-03) or audit log
(S-10) would otherwise be useless.

**Fix.** Add to the `backend` service in `docker-compose.prod.yml`:
`environment: { FORWARDED_ALLOW_IPS: "*" }` (safe because only Caddy can
reach port 8000 on the Docker network) — or pass
`--forwarded-allow-ips '*'` in the Dockerfile `CMD`. Caddy's
`reverse_proxy` already sets `X-Forwarded-For`/`X-Forwarded-Proto`.

#### S-07 · Email change without re-authentication or verification — Medium

`PATCH /users/me` (`backend/app/routers/users.py:23`) accepts a new `email`
with only a valid access token (`UserProfileUpdate`,
`backend/app/schemas/user.py:15-17`). A hijacked session (XSS, shared
computer, leaked token) can therefore be converted into permanent account
takeover: change the email, request a reset link to the new address. A
typo also locks the user out silently.

**Fix.** Require `current_password` for any email change (dedicated
`POST /users/me/email` or a required field when `email` is present), send a
notice to the *old* address, revoke all refresh tokens for the user
(`revoke_all_for_user(..., reason='email_changed')`), and ideally require
the new address to be confirmed via a short-lived token before it becomes
the login identifier.

#### S-08 · `python-jose` + `ecdsa` dependency chain — Medium

`backend/app/core/security.py:7` uses `python-jose`, which pulls in
`ecdsa` (unfixed PYSEC-2026-1325), `rsa` and `pyasn1`. HS256 does not
exercise the vulnerable code, but `python-jose` is lightly maintained and
its `decode()` accepts a caller-supplied algorithm list — one refactor away
from an algorithm-confusion bug.

**Fix.** Replace with `PyJWT` (`jwt.encode(payload, SECRET_KEY,
algorithm='HS256')` / `jwt.decode(token, SECRET_KEY, algorithms=['HS256'])`,
catch `jwt.PyJWTError`), and pin `ALGORITHM` to `HS256` in settings
validation. Removes four packages from the production image.

#### S-10 · No security event logging — Medium

Failed logins, password-reset requests/completions, refresh-token reuse
detection, admin user changes, and 429s are not logged with actor/IP.
Incident response today would rely on Caddy access logs only.

**Fix.** A small `security_log = logging.getLogger('security')` with
structured `key=value` messages: `login_failed email=… ip=…`,
`login_success user_id=… ip=…`, `refresh_reuse_detected user_id=… family=…`,
`password_reset_requested user_id=…`, `password_reset_completed user_id=…`,
`admin_user_updated actor=… target=… fields=…`, `rate_limited route=… ip=…`.
Keep it to INFO/WARNING so it survives the 10 MB × 3 rotation, and forward
WARNING+ to Sentry as messages if you want alerts.

#### S-11 · Password policy — Medium

Minimum 8 characters, no maximum on `ResetPasswordRequest.new_password`
(`backend/app/schemas/auth.py:19`; bcrypt silently truncates at 72 bytes),
no common-password check, and the frontend enforces only `minLength={8}`.

**Fix.** `min_length=12, max_length=72` on both create and reset schemas
and matching `minLength` in `ResetPasswordPage.tsx`; reject the email/name
as password; optionally check against a bundled top-10k list. Communicate
the rule to the customer with the hand-over.

#### S-12 · Public repository leaks infrastructure details — Medium

`github.com/luneroka/budget_construction` is public (HTTP 200 unauthenticated),
and `docs/architecture/production_deployment_runbook.md:222-256` records the
provider, plan, primary IPv4/IPv6, OS, Docker versions, and the full
hardening/deploy history; the Caddyfile records the domains. Nothing secret
is committed (verified: only `.env.example`/`.env.production.example` ever
existed in history; gitleaks is in CI), but this is a precise targeting
dossier for a product sold to a customer.

**Fix.** Make the repository private (it is a customer deliverable, not an
OSS project). If it must stay public, move the "VPS Information",
"Chunk 3/4 Result" and "Deployment History" sections to `docs/untracked/`
and scrub the git history (`git filter-repo`) — which is far more work than
flipping visibility.

#### S-13 · User email sent to Sentry — Low (privacy)

`backend/app/dependencies/auth.py:50` attaches `{'id', 'email'}` to every
Sentry event. Under GDPR this is personal data transferred to a US
processor; it should be either dropped or covered by the customer's privacy
notice/DPA.

**Fix.** `sentry_sdk.set_user({'id': str(user.id)})` — the id is enough to
find the user in the database.

#### S-14 · Issue-report attachments are not validated — Low

`backend/app/routers/issue_reports.py:71` forwards any content type to the
support mailbox with the client-declared MIME type; total size can reach
50 MB (Resend caps at 40 MB → 502).

**Fix.** Reuse `detect_mime_type` to allow only PNG/JPEG/PDF, cap the total
at 20 MB, cap `description` at 5 000 characters.

#### S-15 · Access tokens survive a password reset — Low

Refresh tokens are revoked on reset, but an already-issued access token
stays valid for up to 30 minutes. Deactivation is immediate (checked on
every request), so this is only a short window.

**Fix (cheap).** Include the same `pwd` HMAC marker used in reset tokens in
access tokens and compare it in `get_current_user`, or store
`password_changed_at` and reject tokens issued before it.

### P2 — hardening backlog

- **S-16 Container hardening.** Add `security_opt: ["no-new-privileges:true"]`
  to every service, `cap_drop: [ALL]` on `backend`/`migrate`/`frontend`,
  `read_only: true` + `tmpfs: [/tmp]` on `backend` once verified, and
  `docker compose build --pull` / `docker compose pull` on each deploy so
  `postgres:15-alpine` and `caddy:2-alpine` pick up patched images.
- **S-17 Least-privilege database role.** `POSTGRES_USER` is a superuser and
  the application connects as it. Create an `app` role with only DML on
  `public`/`analytics` and keep the superuser for migrations/backups.
- **S-18 CORS.** `allow_methods=['*']`/`allow_headers=['*']`
  (`backend/app/main.py:84-85`) are harmless behind the same-origin
  `/api` prefix; tighten to `GET, POST, PATCH, DELETE` and
  `Authorization, Content-Type` for hygiene.
- **S-19 Refresh-cookie path.** `path='/'` (`backend/app/routers/auth.py:38,43`).
  In production the API lives under `/api`, so `path=/api/auth` (configurable)
  keeps the cookie off every SPA and static request.
- **S-20 Dependency & vulnerability automation.** Add
  `.github/dependabot.yml` (pip in `/backend`, npm in `/frontend`,
  `github-actions`, `docker`) and a CI job running `uvx pip-audit` on
  `uv export --no-dev` plus `npm audit --omit=dev --audit-level=high`. This is
  what prevents S-04 from recurring.
- **S-21 Cross-user authorization tests.** One parametrised test per
  resource family (project, budget line, transaction, document, supplier,
  supplier document, trash, export) asserting user B gets 404 on user A's
  ids for every verb. Cheap insurance for the ownership model the whole app
  relies on.
- **S-22 Local `.env` credentials.** The runbook's 2026-07-13 review flagged
  that the local `.env` holds live R2/Resend credentials; the file still
  contains R2 and Resend keys today. Confirm they are dev-scoped
  (dedicated bucket + token, Resend test key) and rotate if not.
- **S-23 Health endpoints.** `/api/health/ready` is public and reveals DB
  reachability. Acceptable; restrict to the Docker network in Caddy if no
  external monitor needs it.
- **S-24 Admin bootstrap.** Document how the first admin is created on the
  VPS (SQL `UPDATE users SET is_admin = true` or a CLI) now that
  self-registration goes away.

---

## 4. Remediation plan

Work packages in execution order. Each is independently deployable.

| Pkg | Contents | Findings | Effort | Deploy type |
|-----|----------|----------|--------|-------------|
| **WP-0 Hotfix (Caddy only)** | Block `/api/docs`, `/api/redoc`, `/api/openapi.json`, `/api/auth/register` at Caddy; add security headers (CSP in Report-Only); `Cache-Control: no-store` on API; `request_body max_size`. | S-01 (mitigation), S-02, S-05, S-06 | 1–2 h | Caddy reload, zero downtime |
| **WP-1 Backend security release** | Remove `/auth/register`, add admin user creation + invite email; disable docs in prod; dependency upgrades; `FORWARDED_ALLOW_IPS`; slowapi rate limits; security logging; password policy; Sentry id-only; attachment validation; reset-password `max_length`. | S-01, S-02, S-03, S-04, S-09, S-10, S-11, S-13, S-14 | 1.5–2 d | `up -d --build`, ~30 s API blip |
| **WP-2 Frontend release** | `npm audit fix`; 429 + 413 messages; `minLength=12`; email-change form with current password. | S-04, S-07 (UI), S-11 | 0.5 d | `up -d --build` (frontend job + Caddy volume) |
| **WP-3 Auth follow-ups** | PyJWT migration; email-change re-auth/verification/revocation; access-token password marker. | S-07, S-08, S-15 | 1 d | `up -d --build` |
| **WP-4 Process & repo** | Repo private; Dependabot + audit CI; IDOR test matrix; local `.env` creds check; admin bootstrap doc. | S-12, S-20, S-21, S-22, S-24 | 0.5–1 d | none / CI |
| **WP-5 Infra hardening** | Compose `no-new-privileges`/`cap_drop`/`read_only`; least-privilege DB role; CSP enforce after Report-Only week; cookie path; CORS tightening. | S-16, S-17, S-18, S-19, S-05 (enforce) | 1 d | `up -d --build` + Caddy reload |

### WP-0 Caddyfile (complete target for the hotfix)

```caddyfile
{
	email {$ACME_EMAIL}
}

{$DOMAIN} {
	encode zstd gzip

	header {
		-Server
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
		X-Content-Type-Options "nosniff"
		X-Frame-Options "DENY"
		Referrer-Policy "strict-origin-when-cross-origin"
		Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
		Cross-Origin-Opener-Policy "same-origin"
		Content-Security-Policy-Report-Only "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https://*.r2.cloudflarestorage.com; connect-src 'self'; frame-src https://*.r2.cloudflarestorage.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests"
	}

	# Hotfix: hide the schema and the orphan registration route until WP-1 ships.
	@blocked path /api/docs /api/docs/* /api/redoc /api/openapi.json /api/auth/register
	handle @blocked {
		respond 404
	}

	@api path /api /api/*
	handle @api {
		header Cache-Control "no-store"
		request_body {
			max_size 25MB
		}
		uri strip_prefix /api
		reverse_proxy backend:8000
	}

	handle {
		root * /srv
		try_files {path} /index.html
		file_server
	}
}

batibudget.fr, www.batibudget.fr, www.batibudget.com {
	redir https://batibudget.com{uri} permanent
}
```

Validate with `caddy validate --config Caddyfile` before reloading.

### WP-1 implementation notes

- **Rate limiting.** `uv add slowapi`; in `main.py`:

  ```python
  from slowapi import Limiter, _rate_limit_exceeded_handler
  from slowapi.errors import RateLimitExceeded
  from slowapi.util import get_remote_address

  limiter = Limiter(key_func=get_remote_address, headers_enabled=True)
  app.state.limiter = limiter
  app.add_exception_handler(RateLimitExceeded, rate_limited_handler)  # returns the error envelope with code 'rate_limited'
  ```

  Decorate the routes listed under S-03 with `@limiter.limit('5/minute')`
  etc. (the decorated function must take `request: Request`). Add a
  per-email limiter for login/forgot-password using the email as key. Add
  `'rate_limited': {'message': 'Too many requests'}` to `ERROR_DEFINITIONS`
  and a French string in `client.ts`, plus `429: 'rate_limited'` in the
  status fallback table. Tests: assert the 6th login in a minute is 429 and
  that the limiter is disabled (`limiter.enabled = False`) in the test
  fixture for the rest of the suite.
- **Admin user creation.** `POST /admin/users` with `{name, email}` →
  create user with a random unusable password
  (`hash_password(secrets.token_urlsafe(32))`), then send the reset link
  exactly as `forgot_password` does. Response: `AdminUserRead`. No UI is
  strictly needed for delivery — a `curl` recipe in the runbook is enough —
  but a minimal admin page is a good WP-2 stretch.
- **Docs off in prod.** See S-02 snippet; keep the Caddy block as well.
- **Client IP.** `FORWARDED_ALLOW_IPS: "*"` on the backend service in
  `docker-compose.prod.yml`; `get_remote_address` then sees the real IP.
- **Dependencies.** After `uv lock --upgrade-package …`, re-run
  `uvx pip-audit -r <(uv export --no-dev --no-hashes)` and expect only the
  `ecdsa` line until WP-3 removes python-jose.

---

## 5. Production rollout (existing VPS)

The app is live; every package below is applied on the VPS over SSH as
`deploy`, from `/home/deploy/budget_construction`, following the runbook's
"Deployment Commands". Users are in Guadeloupe and France, so schedule
WP-1/WP-2 (which restart the API) in the 06:00–07:00 UTC window already used
by the backup timers, or announce a 5-minute maintenance.

### Before anything

```sh
cd /home/deploy/budget_construction
git rev-parse --short HEAD > /tmp/rollback-rev        # rollback target
./scripts/backup_db.sh                                 # verified backup
ls -l .env.production                                  # must be -rw------- deploy
grep -E '^ACCESS_TOKEN_EXPIRE_MINUTES=' .env.production  # expect 30, not 10080
```

### WP-0 — Caddy hotfix (no downtime)

```sh
git pull
docker compose --env-file .env.production -f docker-compose.prod.yml \
  exec caddy caddy validate --config /etc/caddy/Caddyfile
docker compose --env-file .env.production -f docker-compose.prod.yml \
  exec caddy caddy reload --config /etc/caddy/Caddyfile
```

`up -d` does **not** restart Caddy for a bind-mounted file change, hence
the explicit `reload`. Verify:

```sh
curl -sI https://batibudget.com | grep -iE 'strict-transport|content-security|x-frame|permissions-policy'
curl -s -o /dev/null -w '%{http_code}\n' https://batibudget.com/api/docs           # 404
curl -s -o /dev/null -w '%{http_code}\n' https://batibudget.com/api/openapi.json   # 404
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://batibudget.com/api/auth/register  # 404
curl -sI https://batibudget.com/api/health/live | grep -i cache-control            # no-store
```

Rollback: `git checkout <rollback-rev> -- Caddyfile` and reload again.

### WP-1 / WP-2 / WP-3 / WP-5 — application releases

```sh
git pull
docker compose --env-file .env.production -f docker-compose.prod.yml config >/dev/null  # syntax
docker compose --env-file .env.production -f docker-compose.prod.yml pull db caddy          # patched base images
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build --pull always
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml logs --since 5m backend migrate
```

The `frontend` job re-copies the SPA into the Caddy volume; Caddy serves
the new bundle immediately (no reload needed for static files). If the
Caddyfile also changed in the same release, run the WP-0 `reload` step.

Post-deploy checks (in addition to the runbook's login/refresh/upload/
download/reset/issue-report list):

```sh
# rate limit: 6 quick bad logins -> last one is 429
for i in $(seq 1 6); do curl -s -o /dev/null -w '%{http_code} ' -X POST \
  https://batibudget.com/api/auth/login -d 'username=x@example.com&password=wrong'; done; echo
# real client IP reaches the app (look for your IP, not 172.x, in the security log)
docker compose --env-file .env.production -f docker-compose.prod.yml logs --since 2m backend | grep login_failed
# body cap
head -c 30000000 /dev/zero | curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  -H 'Authorization: Bearer invalid' --data-binary @- https://batibudget.com/api/issue-reports   # 413
```

Rollback: `git checkout <rollback-rev>` and re-run `up -d --build`. No
package in this plan adds a migration, so a code rollback is sufficient.

### Secrets

No secret is known to be compromised; rotation is optional but cheap and
recommended at hand-over so the customer starts from keys nobody else has
ever seen:

- `SECRET_KEY`: rotating it invalidates outstanding access and reset tokens
  only — sessions survive because refresh tokens are database-backed; users
  simply get a new access token on their next request.
- `POSTGRES_PASSWORD`: requires `ALTER USER … PASSWORD` inside the `db`
  container *and* updating both `POSTGRES_PASSWORD` and `DATABASE_URL`, then
  restarting `backend`.
- R2 and Resend tokens: create new, update `.env.production`, restart
  `backend`, then delete the old ones in the dashboards.

### External verification after WP-0 and after WP-5

- <https://securityheaders.com> and Mozilla Observatory on `batibudget.com`
  (target: A after CSP is enforced).
- <https://www.ssllabs.com/ssltest/> (expect A/A+ with Caddy defaults + HSTS).

---

## 6. Hand-over notes for the customer

- Accounts are created by the administrator (WP-1); there is no public
  sign-up. Users set their password through the emailed link.
- Password rule: at least 12 characters (WP-1/WP-2).
- Data location: application and database on Hetzner (Germany); documents
  and encrypted backups on Cloudflare R2; transactional email via Resend;
  error telemetry via Sentry (user id only after WP-1). Include these
  processors in the privacy notice/DPA.
- Backups: daily encrypted database dump (7 days local, 30 days off-host),
  daily additive documents mirror; restore procedure in the runbook.
- Support/incident contact: `SUPPORT_EMAIL`; security events are logged
  (WP-1) and can be reviewed on request.

---

## 7. Accepted risks / out of scope

- Single VPS, single region: availability is not a security control here
  and is covered by the DR section of the runbook.
- No WAF/CDN in front of the origin; mitigated by application rate limits
  and Caddy body limits. Revisit if abuse is observed (Cloudflare proxy is
  the natural next step).
- Google Fonts is loaded from Google's CDN (third-party request per page
  load). Self-host the two families if the customer objects on privacy
  grounds; the CSP then drops both Google hosts.
- Business-logic authorization (which user may see which project) is
  single-owner by design; there is no sharing model to audit.
