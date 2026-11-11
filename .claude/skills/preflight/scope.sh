#!/usr/bin/env bash
#
# /preflight scope: which check groups this change can affect. Prints
#   BACKEND=yes|no
#   FRONTEND=yes|no
# from the paths changed since the merge-base with the base branch,
# plus uncommitted changes and untracked files. The exit status is 0
# whatever it finds.
#
# A script rather than a block in SKILL.md because Claude Code substitutes
# skill arguments into positional placeholders, which would mangle shell
# and awk positional variables written in the skill text.
#
# Rules, first match wins for each path:
#   docs/**                      -> neither
#   .claude/**                   -> both (Markdown included: the skill text
#                                   is what drives the checks)
#   any other *.md               -> neither
#   backend/**                   -> backend
#   frontend/**                  -> frontend
#   anything else                -> both: shared or ambiguous (compose
#                                   files, Caddyfile, scripts/, .github/,
#                                   .env*.example, deploy/, analytics/,
#                                   other root files)
#
# Usage: .claude/skills/preflight/scope.sh [base-branch]   (default main)
#
set -uo pipefail

base="${1:-main}"
backend=no
frontend=no

# git ls-files prints paths relative to the current directory, git diff
# relative to the root: run from the root so both agree.
top="$(git rev-parse --show-toplevel 2>/dev/null)" && cd "$top"

if ! mb="$(git merge-base "$base" HEAD 2>/dev/null)"; then
  # No merge-base: the scope is unknown, so nothing is skipped.
  echo "scope: no merge-base with '$base', running every group" >&2
  echo 'BACKEND=yes'
  echo 'FRONTEND=yes'
  exit 0
fi

# --no-renames lists both sides of a rename, so a file moved out of a
# group still counts for it.
paths="$({
  git diff --name-only --no-renames "$mb" HEAD
  git diff --name-only --no-renames HEAD
  git ls-files --others --exclude-standard
} | sort -u)"

while IFS= read -r p; do
  [ -z "$p" ] && continue
  case "$p" in
    docs/*) ;;
    .claude/*) backend=yes; frontend=yes ;;
    *.md) ;;
    backend/*) backend=yes ;;
    frontend/*) frontend=yes ;;
    *) backend=yes; frontend=yes ;;
  esac
done <<< "$paths"

echo "BACKEND=$backend"
echo "FRONTEND=$frontend"
exit 0
