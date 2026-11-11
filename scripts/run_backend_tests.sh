#!/usr/bin/env bash
#
# Run the backend test suite against a throwaway PostgreSQL started for this
# run only, then removed.
#
# Why not the shared `db-test` on port 5435: other projects on the same
# machine publish their own test database on that port, and two runs sharing
# one database wipe each other's schema (tests/conftest.py drops `public`
# around every test). Here each run gets its own Compose project
# (<repo folder>-test-<pid>) and a free host port picked at start, so runs
# in other projects, other checkouts or other sessions never meet.
#
# The database is the `db-test` service of docker-compose.yml, with its
# public test credentials (the same as CI's). Its URL is passed to pytest
# as RUN_TESTS_DATABASE_URL, which conftest.py lets replace .env.test's
# DATABASE_URL; nothing else in .env.test is overridden.
#
# Usage:
#   scripts/run_backend_tests.sh                 # whole suite
#   scripts/run_backend_tests.sh tests/api -x    # anything pytest accepts
#
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

prefix="$(basename "$REPO_ROOT" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9_\n-' '-')-test"
project="${prefix}-$$"
compose=(docker compose -p "$project")

cleanup() {
  "${compose[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

# A run killed outright (SIGKILL, a crash) cannot run its trap and leaves
# its project behind. Remove those first: a <prefix>-<pid> project whose
# process no longer exists.
for stale in $(docker ps -a --filter label=com.docker.compose.project \
    --format '{{.Label "com.docker.compose.project"}}' 2>/dev/null \
    | sort -u | grep -E "^${prefix}-[0-9]+$" || true); do
  if ! kill -0 "${stale##*-}" 2>/dev/null; then
    echo "run_backend_tests: removing the leftover project $stale" >&2
    docker compose -p "$stale" down -v --remove-orphans >/dev/null 2>&1 || true
  fi
done

# A free port from the OS, passed explicitly: Docker Desktop does not
# reliably publish a port given as 0. Another process can take the port
# between the check and the start, so a refused start or a port Docker did
# not publish is retried with a new one.
free_port() {
  python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()'
}

port=
last_error=
for _ in 1 2 3 4 5; do
  candidate="$(free_port)"
  if last_error="$(DB_TEST_PORT="$candidate" "${compose[@]}" up -d db-test 2>&1 >/dev/null)"; then
    published="$("${compose[@]}" port db-test 5432 2>/dev/null | sed 's/.*://')"
    if [ "$published" = "$candidate" ]; then
      port="$candidate"
      break
    fi
    last_error="db-test started but port $candidate was not published (got '${published}')"
  fi
  cleanup
done
if [ -z "$port" ]; then
  echo "run_backend_tests: could not start db-test after 5 attempts; last error:" >&2
  echo "$last_error" >&2
  exit 1
fi

# Over TCP on purpose: during its first start the image runs a temporary
# server on the Unix socket only, which would answer before the real one.
ready=no
for _ in $(seq 1 60); do
  if "${compose[@]}" exec -T db-test \
      pg_isready -h 127.0.0.1 -U postgres -d budget_construction_test >/dev/null 2>&1; then
    ready=yes
    break
  fi
  sleep 1
done
if [ "$ready" != yes ]; then
  echo "run_backend_tests: db-test not ready after 60 s" >&2
  exit 1
fi

echo "run_backend_tests: project $project, database on port $port" >&2

cd backend
RUN_TESTS_DATABASE_URL="postgresql+asyncpg://postgres:postgres@localhost:${port}/budget_construction_test" \
  uv run pytest "$@"
