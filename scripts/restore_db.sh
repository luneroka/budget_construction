#!/usr/bin/env bash
#
# Restore an encrypted Budget Construction backup produced by backup_db.sh.
#
# Usage:
#   scripts/restore_db.sh <backup-file> [--target-db NAME] [--create] [--yes]
#   scripts/restore_db.sh --from-r2 <object-name> [--target-db NAME] [--create] [--yes]
#
# <backup-file>       a local db-*.sql.gz.enc file
# --from-r2 <name>    download the named object from BACKUP_R2_BUCKET first
# --target-db NAME    database to restore INTO (default: the container's
#                     POSTGRES_DB). Restore expects an EMPTY database.
# --create            create the target database first (use for scratch/test
#                     restores, or a fresh empty DR database)
# --yes               skip the interactive confirmation
#
# Config resolution matches backup_db.sh (env first, then ENV_FILE). The
# BACKUP_ENCRYPTION_PASSPHRASE must match the one used to create the backup.
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
DB_SERVICE="${DB_SERVICE:-db}"
BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/backups}"

log() { printf '%s restore_db: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }
read_env() { [ -f "$ENV_FILE" ] && grep -E "^$1=" "$ENV_FILE" | head -n1 | cut -d= -f2- || true; }
resolve() { local v="${!1:-}"; [ -n "$v" ] && printf '%s' "$v" || read_env "$1"; }

backup_file=""
from_r2=""
target_db=""
do_create=0
assume_yes=0
while [ $# -gt 0 ]; do
  case "$1" in
    --from-r2) from_r2="$2"; shift 2 ;;
    --target-db) target_db="$2"; shift 2 ;;
    --create) do_create=1; shift ;;
    --yes) assume_yes=1; shift ;;
    -*) die "unknown option: $1" ;;
    *) backup_file="$1"; shift ;;
  esac
done

BACKUP_ENCRYPTION_PASSPHRASE="$(resolve BACKUP_ENCRYPTION_PASSPHRASE)"
[ -n "$BACKUP_ENCRYPTION_PASSPHRASE" ] || die "BACKUP_ENCRYPTION_PASSPHRASE is not set"
command -v openssl >/dev/null || die "openssl not found"

if [ -n "$from_r2" ]; then
  command -v rclone >/dev/null || die "rclone not found (needed for --from-r2)"
  BACKUP_R2_BUCKET="$(resolve BACKUP_R2_BUCKET)"
  [ -n "$BACKUP_R2_BUCKET" ] || die "BACKUP_R2_BUCKET is not set"
  export RCLONE_CONFIG_R2_TYPE=s3
  export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
  export RCLONE_CONFIG_R2_ENV_AUTH=false
  export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$(resolve BACKUP_R2_ACCESS_KEY_ID)"
  export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$(resolve BACKUP_R2_SECRET_ACCESS_KEY)"
  export RCLONE_CONFIG_R2_ENDPOINT="$(resolve BACKUP_R2_ENDPOINT)"
  mkdir -p "$BACKUP_DIR"
  log "downloading '$from_r2' from R2 bucket '$BACKUP_R2_BUCKET'"
  rclone copy "R2:$BACKUP_R2_BUCKET/$from_r2" "$BACKUP_DIR/"
  backup_file="$BACKUP_DIR/$from_r2"
fi

[ -n "$backup_file" ] || die "no backup file specified"
[ -f "$backup_file" ] || die "backup file not found: $backup_file"

# Resolve the target database name from the container if not given.
container_db="$(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T "$DB_SERVICE" \
  sh -c 'printf "%s" "$POSTGRES_DB"')"
target_db="${target_db:-$container_db}"

log "backup file : $backup_file"
log "target db   : $target_db (service '$DB_SERVICE')"
if [ "$assume_yes" -ne 1 ]; then
  printf 'This will restore into database "%s". Existing objects there will conflict. Continue? [y/N] ' "$target_db"
  read -r reply
  case "$reply" in y|Y|yes|YES) ;; *) die "aborted by user" ;; esac
fi

export _BACKUP_ENC_PASS="$BACKUP_ENCRYPTION_PASSPHRASE"

if [ "$do_create" -eq 1 ]; then
  log "creating database '$target_db'"
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T "$DB_SERVICE" \
    sh -c "createdb -U \"\$POSTGRES_USER\" \"$target_db\""
fi

log "decrypting and restoring..."
# openssl decrypt | gunzip (fails loudly on a corrupt/tampered file via the
# gzip CRC) | psql into the target database.
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:_BACKUP_ENC_PASS -in "$backup_file" \
  | gzip -d \
  | docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T "$DB_SERVICE" \
      sh -c "psql -v ON_ERROR_STOP=1 -U \"\$POSTGRES_USER\" -d \"$target_db\""

log "restore complete into '$target_db'"
