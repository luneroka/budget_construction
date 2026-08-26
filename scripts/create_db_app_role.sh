#!/usr/bin/env bash
#
# Create (or update) the least-privilege PostgreSQL role the API connects
# as, so the application no longer runs as the database superuser.
#
# The role gets CONNECT on the database, USAGE on the public and analytics
# schemas, SELECT/INSERT/UPDATE/DELETE on every table and USAGE/SELECT on
# every sequence -- plus the same as DEFAULT PRIVILEGES for objects that
# future migrations (run by the superuser) will create. It cannot create,
# alter or drop tables, create roles, or read other databases.
#
# Idempotent: safe to re-run, and MUST be re-run after a database restore
# (restore_db.sh restores with --no-privileges).
#
# Usage:
#   APP_DB_PASSWORD='<long random password>' scripts/create_db_app_role.sh
#
# Then in .env.production:
#   MIGRATIONS_DATABASE_URL=<the current superuser DATABASE_URL>
#   DATABASE_URL=postgresql+asyncpg://batibudget_app:<password>@db:5432/<POSTGRES_DB>
# and redeploy (`docker compose ... up -d`). The migrate service uses
# MIGRATIONS_DATABASE_URL, the API uses DATABASE_URL.
#
# Tunables: ENV_FILE=.env.production  COMPOSE_FILE=docker-compose.prod.yml
#           DB_SERVICE=db  APP_DB_USER=batibudget_app
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
DB_SERVICE="${DB_SERVICE:-db}"
APP_DB_USER="${APP_DB_USER:-batibudget_app}"

log() { printf '%s create_db_app_role: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }

[ -n "${APP_DB_PASSWORD:-}" ] || die "APP_DB_PASSWORD is not set (export a long random password first)"
case "$APP_DB_USER" in
  *[!a-zA-Z0-9_]*) die "APP_DB_USER must be a plain identifier (letters, digits, underscore)" ;;
esac
case "$APP_DB_PASSWORD" in
  *\'*) die "APP_DB_PASSWORD must not contain a single quote" ;;
esac

log "creating/updating role '$APP_DB_USER' via service '$DB_SERVICE'"

# The password is passed through the environment of the psql process, never
# on a command line, and only ever appears inside the SQL sent over stdin.
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T \
  -e APP_DB_USER="$APP_DB_USER" -e APP_DB_PASSWORD="$APP_DB_PASSWORD" "$DB_SERVICE" \
  sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
           -v app_user="$APP_DB_USER" -v app_password="$APP_DB_PASSWORD" \
           -v db_name="$POSTGRES_DB" -v owner="$POSTGRES_USER"' <<'SQL'
-- Role: login only, no superuser/createdb/createrole, no inheritance games.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user') THEN
    EXECUTE format('CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT',
                   :'app_user', :'app_password');
  ELSE
    EXECUTE format('ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE',
                   :'app_user', :'app_password');
  END IF;
END
$$;

GRANT CONNECT ON DATABASE :"db_name" TO :"app_user";
GRANT USAGE ON SCHEMA public TO :"app_user";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"app_user";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :"app_user";
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner" IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_user";
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner" IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO :"app_user";

-- Analytics views (read-only by nature; created by a migration).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'analytics') THEN
    EXECUTE format('GRANT USAGE ON SCHEMA analytics TO %I', :'app_user');
    EXECUTE format('GRANT SELECT ON ALL TABLES IN SCHEMA analytics TO %I', :'app_user');
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA analytics GRANT SELECT ON TABLES TO %I',
                   :'owner', :'app_user');
  END IF;
END
$$;
SQL

log "done. Now point DATABASE_URL at '$APP_DB_USER' and keep the superuser URL in MIGRATIONS_DATABASE_URL (see script header)."
