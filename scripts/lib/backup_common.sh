#!/usr/bin/env bash
#
# Shared helpers for the backup_*.sh scripts (log/config-resolution/
# failure-alert). Source this file after setting:
#   SCRIPT_TAG          short name used as the log prefix, e.g. "backup_db"
#   ENV_FILE            path read_env()/resolve() fall back to
#   ALERT_JOB_LABEL      human label used in the alert email, e.g.
#                        "Database backup"
#   ALERT_SYSTEMD_UNIT   unit name mentioned in the alert email's
#                        "check the logs" hint
#
# Callers must define set -Eeuo pipefail themselves before/after sourcing
# (bash does not carry shell options across `source` in a meaningful way
# that changes this guidance) and call setup_error_trap after resolving
# their own config.

log() { printf '%s %s: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$SCRIPT_TAG" "$*"; }

# Read a single KEY=value from ENV_FILE without shell-evaluating the file
# (the file legitimately contains values with spaces and shell metacharacters).
read_env() { [ -f "$ENV_FILE" ] && grep -E "^$1=" "$ENV_FILE" | head -n1 | cut -d= -f2- || true; }
# Environment wins; fall back to ENV_FILE.
resolve() { local v="${!1:-}"; [ -n "$v" ] && printf '%s' "$v" || read_env "$1"; }

json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  printf '%s' "$s"
}

# Resolves the shared Resend-based alert config. Callers may override
# ALERT_EMAIL by setting BACKUP_ALERT_EMAIL before calling this.
resolve_alert_config() {
  ALERT_RESEND_API_KEY="$(resolve RESEND_API_KEY)"
  ALERT_RESEND_FROM="$(resolve RESEND_FROM)"
  ALERT_EMAIL="$(resolve BACKUP_ALERT_EMAIL)"
  [ -n "$ALERT_EMAIL" ] || ALERT_EMAIL="$(resolve SUPPORT_EMAIL)"
}

# Best-effort failure alert -- must never itself crash or block the caller,
# and must never be the reason a failed job looks like it "handled" the
# error. Every command in here is defensive on purpose.
send_failure_alert() {
  local reason="$1"
  if [ -z "${ALERT_RESEND_API_KEY:-}" ] || [ -z "${ALERT_RESEND_FROM:-}" ] || [ -z "${ALERT_EMAIL:-}" ]; then
    log "WARNING: alert email not configured (RESEND_API_KEY/RESEND_FROM/BACKUP_ALERT_EMAIL) -- skipping"
    return 0
  fi
  if ! command -v curl >/dev/null 2>&1; then
    log "WARNING: curl not found -- cannot send failure alert"
    return 0
  fi

  local host subject body payload http_status
  host="$(hostname 2>/dev/null || printf 'unknown-host')"
  subject="[Bâti Budget] ${ALERT_JOB_LABEL} FAILED on $host"
  body="The ${ALERT_JOB_LABEL} job failed and needs attention.

Host: $host
Time (UTC): $(date -u +%Y-%m-%dT%H:%M:%SZ)
Reason: $reason

Check the logs on the VPS:
  journalctl -u ${ALERT_SYSTEMD_UNIT} -n 100

Previous successful runs are unaffected."

  payload="$(printf '{"from":"%s","to":["%s"],"subject":"%s","text":"%s"}' \
    "$(json_escape "$ALERT_RESEND_FROM")" \
    "$(json_escape "$ALERT_EMAIL")" \
    "$(json_escape "$subject")" \
    "$(json_escape "$body")")"

  http_status="$(curl -sS -m 15 -o /dev/null -w '%{http_code}' -X POST \
    https://api.resend.com/emails \
    -H "Authorization: Bearer $ALERT_RESEND_API_KEY" \
    -H 'Content-Type: application/json' \
    -d "$payload" 2>/dev/null || printf 'curl_failed')"

  case "$http_status" in
    200|202) log "failure alert emailed to $ALERT_EMAIL" ;;
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
# pipeline failing under pipefail). Requires `set -E` (errtrace) in the
# caller so this fires inside functions and command substitutions too.
_on_error() {
  local line="$1" cmd="$2"
  send_failure_alert "command failed at line $line: $cmd" || true
}
setup_error_trap() { trap '_on_error "$LINENO" "$BASH_COMMAND"' ERR; }
