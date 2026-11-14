#!/usr/bin/env bash
# Run exactly one named runbook command on the production VPS, over ssh.
#
#   .claude/skills/deploy/vps.sh <name>
#
# The vocabulary below is fixed: only the forward-path commands /deploy
# runs in §2, §4, §5 and §6, verbatim from
# docs/architecture/production_deployment_runbook.md › "Deployment Commands"
# and "Caddyfile-only change". There is no rollback, restore, checkout,
# sudo, .env read, `docker compose config`, arbitrary command or argument
# passthrough. Anything else goes over a plain `ssh` call, which stays on
# the ask list in .claude/settings.json.
#
# The host, user and key are read at run time from the gitignored
# docs/untracked/ (host from vps_information.md › "Primary IPv4", user and
# key from vps_operations_cheatsheet.md › §1). They are never printed:
# ssh's own messages are redacted before they reach the terminal.
#
# Each command goes through a quoted heredoc, after `cd ~/budget_construction`,
# one runbook command per heredoc and per ssh session: a `docker compose exec`
# reads whatever is left of the script as its stdin, so a second command after
# it would be swallowed silently.
#
# Exit status: the remote command's, 2 for a usage error or unknown name,
# 3 when the connection details cannot be read, 255 for an ssh failure.

set -euo pipefail

NAMES="rev record-rollback pull backup list-backups build caddy-validate \
caddy-restart caddy-headers ps logs-migrate health-live health-ready \
prune-builder prune-images df"

usage() {
  echo "usage: vps.sh <name>   (exactly one name)" >&2
  echo "names: $NAMES" >&2
  exit 2
}

[ "$#" -eq 1 ] || usage
name="$1"

# Refuse an unknown name before reading anything or connecting.
case "$name" in
  *[!a-z-]*|"") echo "vps.sh: unknown command '$name', refused" >&2; usage ;;
esac
case " $NAMES " in
  *" $name "*) ;;
  *) echo "vps.sh: unknown command '$name', refused" >&2; usage ;;
esac

# --- connection details, from docs/untracked/ -------------------------------
# A worktree has no docs/untracked/ of its own: fall back to the main checkout.
untracked=""
top="$(git rev-parse --show-toplevel 2>/dev/null || true)"
common="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)"
for dir in "$top" "${common%/.git}"; do
  if [ -n "$dir" ] && [ -f "$dir/docs/untracked/vps_information.md" ]; then
    untracked="$dir/docs/untracked"
    break
  fi
done
if [ -z "$untracked" ]; then
  echo "vps.sh: docs/untracked/vps_information.md not found" >&2
  exit 3
fi

info="$untracked/vps_information.md"
sheet="$untracked/vps_operations_cheatsheet.md"

if [ ! -f "$sheet" ]; then
  echo "vps.sh: docs/untracked/vps_operations_cheatsheet.md not found" >&2
  exit 3
fi

# sed -n '…p;q' stops at the first match, so no SIGPIPE under pipefail.
host="$(sed -n 's/^- Primary IPv4:[[:space:]]*//p' "$info" | sed -n '1p' | tr -d '`[:space:]' || true)"
user="$(sed -n 's/^\*\*User:\*\*[[:space:]]*`\([^`]*\)`.*/\1/p' "$sheet" | sed -n '1p' || true)"
key="$(sed -n 's/^\*\*Key:\*\*[[:space:]]*`\([^`]*\)`.*/\1/p' "$sheet" | sed -n '1p' || true)"
case "$key" in "~/"*) key="$HOME/${key#\~/}" ;; esac

if ! printf '%s' "$host" | grep -Eq '^[0-9]{1,3}(\.[0-9]{1,3}){3}$'; then
  echo "vps.sh: no valid 'Primary IPv4' in vps_information.md" >&2
  exit 3
fi
if ! printf '%s' "$user" | grep -Eq '^[a-z_][a-z0-9_-]*$'; then
  echo "vps.sh: no valid '**User:**' in vps_operations_cheatsheet.md §1" >&2
  exit 3
fi
if [ -z "$key" ] || [ ! -f "$key" ]; then
  echo "vps.sh: the '**Key:**' file from vps_operations_cheatsheet.md §1 is missing" >&2
  exit 3
fi

# --- sending ----------------------------------------------------------------
# BatchMode: never prompt (the key passphrase comes from ssh-agent, ssh-add).
redact() {
  local line
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line//"$user@$host"/<vps>}"
    line="${line//"$host"/<vps>}"
    line="${line//"$key"/<key>}"
    printf '%s\n' "$line"
  done
}

send() {
  local status
  set +e
  { ssh -i "$key" -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=15 \
      "$user@$host" 'bash -s' 2>&1 1>&3 3>&- | redact >&2; } 3>&1
  status="${PIPESTATUS[0]}"
  set -e
  if [ "$status" -eq 255 ]; then
    echo "vps.sh: ssh failed (is the key loaded? Yoann runs ssh-add)" >&2
  fi
  return "$status"
}

# --- the vocabulary: one runbook command each, verbatim ----------------------
case "$name" in
  # §2, and the §4.2 check after the pull
  rev) send <<'EOF'
cd ~/budget_construction
git rev-parse HEAD
EOF
  ;;
  # §4.1
  record-rollback) send <<'EOF'
cd ~/budget_construction
git rev-parse HEAD | tee ~/last-deploy-revision.txt
EOF
  ;;
  # §4.2
  pull) send <<'EOF'
cd ~/budget_construction
git pull origin main
EOF
  ;;
  # §4.3
  backup) send <<'EOF'
cd ~/budget_construction
./scripts/backup_db.sh
EOF
  ;;
  list-backups) send <<'EOF'
cd ~/budget_construction
ls -lh backups/
EOF
  ;;
  # §4.4
  build) send <<'EOF'
cd ~/budget_construction
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build --pull always
EOF
  ;;
  # §4.5, only when the Caddyfile changed
  caddy-validate) send <<'EOF'
cd ~/budget_construction
docker compose --env-file .env.production -f docker-compose.prod.yml exec caddy caddy validate --config /etc/caddy/Caddyfile
EOF
  ;;
  caddy-restart) send <<'EOF'
cd ~/budget_construction
docker compose --env-file .env.production -f docker-compose.prod.yml restart caddy
EOF
  ;;
  caddy-headers) send <<'EOF'
cd ~/budget_construction
curl -sI https://batibudget.com/ | grep -iE "content-security|cross-origin|cache-control"
EOF
  ;;
  # §5
  ps) send <<'EOF'
cd ~/budget_construction
docker compose --env-file .env.production -f docker-compose.prod.yml ps -a
EOF
  ;;
  logs-migrate) send <<'EOF'
cd ~/budget_construction
docker compose --env-file .env.production -f docker-compose.prod.yml logs migrate | tail -5
EOF
  ;;
  health-live) send <<'EOF'
cd ~/budget_construction
curl -fsS https://batibudget.com/api/health/live && echo
EOF
  ;;
  health-ready) send <<'EOF'
cd ~/budget_construction
curl -fsS https://batibudget.com/api/health/ready && echo
EOF
  ;;
  # §6
  prune-builder) send <<'EOF'
cd ~/budget_construction
docker builder prune -f --max-used-space 3GB
EOF
  ;;
  prune-images) send <<'EOF'
cd ~/budget_construction
docker image prune -f
EOF
  ;;
  df) send <<'EOF'
cd ~/budget_construction
df -h /
EOF
  ;;
  *) usage ;;
esac
