#!/usr/bin/env bash
# Build (or remove) the production images of a /deps batch, apart from the dev stack.
# Usage, from the repository root: .claude/skills/deps/prodbuild.sh build|clean
#
# Puts together the runbook's production compose flags, `build backend
# frontend`, and the ENV_FILE hook of docker-compose.prod.yml. Uses
# .env.production.example's placeholder values: no real secret is read and
# .env.production is never created. -p budget-prodbuild keeps the build
# apart from the dev budget_construction-* images.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
case "${1:-}" in
  build) ENV_FILE=.env.production.example docker compose -p budget-prodbuild --env-file .env.production.example -f docker-compose.prod.yml build backend frontend ;;
  clean) docker image rm budget-prodbuild-backend budget-prodbuild-frontend ;;
  *) sed -n '2,3p' "$0"; exit 2 ;;
esac
