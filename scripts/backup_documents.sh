#!/usr/bin/env bash
#
# One-way mirror of the Cloudflare R2 documents bucket, as protection against
# accidental or malicious permanent deletion. R2 has no native object/bucket
# versioning (verified 2026-07-13 against Cloudflare's docs and release
# notes -- only a compatibility shim for GetBucketVersioning exists, it does
# not actually version anything), so this script substitutes a real 30-day
# undelete window: `rclone copy` (NEVER `rclone sync`) is a one-way,
# additive-only mirror -- it uploads new/changed objects but NEVER deletes
# anything from the destination, even when the source object is deleted.
#
# Retention on the destination is handled natively by an R2 Object Lifecycle
# Rule configured on the destination bucket in the Cloudflare dashboard (age-
# based expiration), not by this script -- there is nothing to prune here.
#
# On ANY failure, an email alert is sent via Resend (reusing the app's own
# RESEND_API_KEY/RESEND_FROM), same mechanism as backup_db.sh.
#
# Config is read from the environment first, then from ENV_FILE (default
# .env.production) for any value not already set.
# Required:
#   R2_BUCKET_NAME                  the live documents bucket (source; the
#                                    app's existing setting, reused as-is)
#   DOCS_BACKUP_R2_BUCKET           destination (mirror) bucket
#   DOCS_BACKUP_R2_ACCESS_KEY_ID, DOCS_BACKUP_R2_SECRET_ACCESS_KEY
#                                    a DEDICATED token scoped to Object
#                                    Read & Write on BOTH the source and
#                                    destination buckets only
# Optional:
#   DOCS_BACKUP_R2_ENDPOINT         defaults to R2_ENDPOINT_URL (same
#                                    Cloudflare account/endpoint)
#   BACKUP_ALERT_EMAIL              defaults to SUPPORT_EMAIL
# Tunables (with defaults):
#   ENV_FILE=.env.production
#
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

ENV_FILE="${ENV_FILE:-.env.production}"

SCRIPT_TAG="backup_documents"
ALERT_JOB_LABEL="Documents mirror"
ALERT_SYSTEMD_UNIT="batibudget-docs-mirror.service"
# shellcheck source=lib/backup_common.sh
source "$REPO_ROOT/scripts/lib/backup_common.sh"

resolve_alert_config
setup_error_trap

SOURCE_BUCKET="$(resolve R2_BUCKET_NAME)"
[ -n "$SOURCE_BUCKET" ] || die "R2_BUCKET_NAME is not set"

DEST_BUCKET="$(resolve DOCS_BACKUP_R2_BUCKET)"
[ -n "$DEST_BUCKET" ] || die "DOCS_BACKUP_R2_BUCKET is not set"

ENDPOINT="$(resolve DOCS_BACKUP_R2_ENDPOINT)"
[ -n "$ENDPOINT" ] || ENDPOINT="$(resolve R2_ENDPOINT_URL)"
[ -n "$ENDPOINT" ] || die "DOCS_BACKUP_R2_ENDPOINT (or R2_ENDPOINT_URL) is not set"

ACCESS_KEY_ID="$(resolve DOCS_BACKUP_R2_ACCESS_KEY_ID)"
SECRET_ACCESS_KEY="$(resolve DOCS_BACKUP_R2_SECRET_ACCESS_KEY)"
[ -n "$ACCESS_KEY_ID" ] || die "DOCS_BACKUP_R2_ACCESS_KEY_ID is not set"
[ -n "$SECRET_ACCESS_KEY" ] || die "DOCS_BACKUP_R2_SECRET_ACCESS_KEY is not set"

[ "$SOURCE_BUCKET" != "$DEST_BUCKET" ] || die "source and destination buckets must differ (both resolved to '$SOURCE_BUCKET')"

command -v rclone >/dev/null || die "rclone not found"

export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ENV_AUTH=false
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$ACCESS_KEY_ID"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$SECRET_ACCESS_KEY"
export RCLONE_CONFIG_R2_ENDPOINT="$ENDPOINT"
export RCLONE_CONFIG_R2_ACL=private

log "mirroring R2:$SOURCE_BUCKET -> R2:$DEST_BUCKET (copy only, never deletes)"
# `copy`, never `sync`: sync would delete from the destination anything
# removed from the source, defeating the entire purpose of this script.
rclone copy "R2:$SOURCE_BUCKET" "R2:$DEST_BUCKET" --s3-no-check-bucket --stats-one-line -v

log "done"
