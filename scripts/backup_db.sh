#!/usr/bin/env bash
#
# Encrypted PostgreSQL backup for Budget Construction.
#
# Pipeline: pg_dump (inside the db container) | gzip | openssl AES-256 encrypt
# -> a timestamped file under ./backups, then (optionally) upload to Cloudflare
# R2 and prune old backups both locally and remotely. Plaintext never touches
# disk; only the encrypted artifact is written.
#
# On ANY failure, an email alert is sent via Resend (reusing the app's own
# RESEND_API_KEY/RESEND_FROM) so a failed nightly backup can't go unnoticed --
# this is best-effort and never itself causes a false "success".
#
# Config is read from the environment first, then from ENV_FILE (default
# .env.production) for any value not already set. Required:
#   BACKUP_ENCRYPTION_PASSPHRASE   AES passphrase (KEEP A COPY OFF THE VPS --
#                                  without it the backups are unrecoverable)
# Optional (enable off-host upload when BACKUP_R2_BUCKET is set):
#   BACKUP_R2_BUCKET, BACKUP_R2_ENDPOINT,
#   BACKUP_R2_ACCESS_KEY_ID, BACKUP_R2_SECRET_ACCESS_KEY
# Optional (enable failure-alert email; uses the app's existing RESEND_API_KEY
# and RESEND_FROM if not overridden):
#   BACKUP_ALERT_EMAIL   defaults to SUPPORT_EMAIL if unset
# Tunables (with defaults):
#   ENV_FILE=.env.production  COMPOSE_FILE=docker-compose.prod.yml
#   DB_SERVICE=db  BACKUP_DIR=<repo>/backups
#   LOCAL_RETENTION_DAYS=7  REMOTE_RETENTION_DAYS=30
#
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
DB_SERVICE="${DB_SERVICE:-db}"
BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/backups}"

log() { printf '%s backup_db: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

# Read a single KEY=value from ENV_FILE without shell-evaluating the file
# (the file legitimately contains values with spaces and shell metacharacters).
read_env() { [ -f "$ENV_FILE" ] && grep -E "^$1=" "$ENV_FILE" | head -n1 | cut -d= -f2- || true; }
# Environment wins; fall back to ENV_FILE.
resolve() { local v="${!1:-}"; [ -n "$v" ] && printf '%s' "$v" || read_env "$1"; }

RESEND_API_KEY="$(resolve RESEND_API_KEY)"
RESEND_FROM="$(resolve RESEND_FROM)"
BACKUP_ALERT_EMAIL="$(resolve BACKUP_ALERT_EMAIL)"
[ -n "$BACKUP_ALERT_EMAIL" ] || BACKUP_ALERT_EMAIL="$(resolve SUPPORT_EMAIL)"

json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  printf '%s' "$s"
}

# Best-effort failure alert -- must never itself crash or block the script,
# and must never be the reason a failed backup looks like it "handled" the
# error. Every command in here is defensive on purpose.
send_failure_alert() {
  local reason="$1"
  if [ -z "$RESEND_API_KEY" ] || [ -z "$RESEND_FROM" ] || [ -z "$BACKUP_ALERT_EMAIL" ]; then
    log "WARNING: alert email not configured (RESEND_API_KEY/RESEND_FROM/BACKUP_ALERT_EMAIL) -- skipping"
    return 0
  fi
  if ! command -v curl >/dev/null 2>&1; then
    log "WARNING: curl not found -- cannot send failure alert"
    return 0
  fi

  local host subject body payload http_status
  host="$(hostname 2>/dev/null || printf 'unknown-host')"
  subject="[Bâti Budget] Database backup FAILED on $host"
  body="The nightly database backup failed and needs attention.

Host: $host
Time (UTC): $(date -u +%Y-%m-%dT%H:%M:%SZ)
Reason: $reason

Check the logs on the VPS:
  journalctl -u batibudget-db-backup.service -n 100

No backup was uploaded for this run. Previous backups are unaffected."

  payload="$(printf '{"from":"%s","to":["%s"],"subject":"%s","text":"%s"}' \
    "$(json_escape "$RESEND_FROM")" \
    "$(json_escape "$BACKUP_ALERT_EMAIL")" \
    "$(json_escape "$subject")" \
    "$(json_escape "$body")")"

  http_status="$(curl -sS -m 15 -o /dev/null -w '%{http_code}' -X POST \
    https://api.resend.com/emails \
    -H "Authorization: Bearer $RESEND_API_KEY" \
    -H 'Content-Type: application/json' \
    -d "$payload" 2>/dev/null || printf 'curl_failed')"

  case "$http_status" in
    200|202) log "failure alert emailed to $BACKUP_ALERT_EMAIL" ;;
    *) log "WARNING: failed to send failure alert (Resend responded: $http_status)" ;;
  esac
  return 0
}

die() {
  log "ERROR: $*" >&2
  send_failure_alert "$*" || true
  exit 1
}

# Catches any command failure NOT already routed through die() (e.g. a
# pipeline failing under pipefail). set -E makes this fire inside functions
# and command substitutions too.
on_error() {
  local line="$1" cmd="$2"
  send_failure_alert "command failed at line $line: $cmd" || true
}
trap 'on_error "$LINENO" "$BASH_COMMAND"' ERR

BACKUP_ENCRYPTION_PASSPHRASE="$(resolve BACKUP_ENCRYPTION_PASSPHRASE)"
[ -n "$BACKUP_ENCRYPTION_PASSPHRASE" ] || die "BACKUP_ENCRYPTION_PASSPHRASE is not set"

BACKUP_R2_BUCKET="$(resolve BACKUP_R2_BUCKET)"
BACKUP_R2_ENDPOINT="$(resolve BACKUP_R2_ENDPOINT)"
BACKUP_R2_ACCESS_KEY_ID="$(resolve BACKUP_R2_ACCESS_KEY_ID)"
BACKUP_R2_SECRET_ACCESS_KEY="$(resolve BACKUP_R2_SECRET_ACCESS_KEY)"
LOCAL_RETENTION_DAYS="$(resolve BACKUP_LOCAL_RETENTION_DAYS)"; LOCAL_RETENTION_DAYS="${LOCAL_RETENTION_DAYS:-7}"
REMOTE_RETENTION_DAYS="$(resolve BACKUP_REMOTE_RETENTION_DAYS)"; REMOTE_RETENTION_DAYS="${REMOTE_RETENTION_DAYS:-30}"

command -v openssl >/dev/null || die "openssl not found"
command -v gzip >/dev/null || die "gzip not found"

mkdir -p "$BACKUP_DIR"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
outfile="$BACKUP_DIR/db-$timestamp.sql.gz.enc"
tmpfile="$outfile.partial"

# Clean up a partial file if any step fails, so a failed run never leaves an
# artifact that looks like a valid backup.
cleanup() { [ -f "$tmpfile" ] && rm -f "$tmpfile"; }
trap cleanup EXIT

export _BACKUP_ENC_PASS="$BACKUP_ENCRYPTION_PASSPHRASE"

log "starting dump of service '$DB_SERVICE' via $COMPOSE_FILE"
# pipefail ensures a pg_dump failure aborts the whole pipeline (no truncated backup).
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T "$DB_SERVICE" \
  sh -c 'pg_dump --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  | gzip \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:_BACKUP_ENC_PASS \
  > "$tmpfile"

[ -s "$tmpfile" ] || die "backup is empty -- dump failed"
mv "$tmpfile" "$outfile"
trap - EXIT
size="$(du -h "$outfile" | cut -f1)"
log "wrote $outfile ($size)"

if [ -n "$BACKUP_R2_BUCKET" ]; then
  command -v rclone >/dev/null || die "rclone not found but BACKUP_R2_BUCKET is set"
  [ -n "$BACKUP_R2_ENDPOINT" ] || die "BACKUP_R2_ENDPOINT required for R2 upload"
  export RCLONE_CONFIG_R2_TYPE=s3
  export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
  export RCLONE_CONFIG_R2_ENV_AUTH=false
  export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$BACKUP_R2_ACCESS_KEY_ID"
  export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$BACKUP_R2_SECRET_ACCESS_KEY"
  export RCLONE_CONFIG_R2_ENDPOINT="$BACKUP_R2_ENDPOINT"
  export RCLONE_CONFIG_R2_ACL=private

  log "uploading to R2 bucket '$BACKUP_R2_BUCKET'"
  rclone copy "$outfile" "R2:$BACKUP_R2_BUCKET/" --s3-no-check-bucket
  log "pruning remote backups older than ${REMOTE_RETENTION_DAYS}d"
  rclone delete "R2:$BACKUP_R2_BUCKET/" \
    --min-age "${REMOTE_RETENTION_DAYS}d" --include 'db-*.sql.gz.enc'
else
  log "BACKUP_R2_BUCKET not set -- skipping off-host upload (LOCAL-ONLY backup)"
fi

log "pruning local backups older than ${LOCAL_RETENTION_DAYS}d"
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'db-*.sql.gz.enc' \
  -mtime "+$LOCAL_RETENTION_DAYS" -print -delete

log "done"
