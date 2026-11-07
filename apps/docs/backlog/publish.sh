#!/usr/bin/env bash
# Creates one GitHub issue per draft in this directory. Public and hard to undo: review the drafts first.
# Usage: bash apps/docs/backlog/publish.sh [--dry-run]
set -euo pipefail
cd "$(dirname "$0")"
REPO="tobin-protocol/tobin"
for f in DOC-*.md; do
  title="$(sed -n 's/^<!-- title: \(.*\) -->$/\1/p' "$f" | head -n 1)"
  labels="$(sed -n 's/^<!-- labels: \(.*\) -->$/\1/p' "$f" | head -n 1)"
  if [ "${1:-}" = "--dry-run" ]; then echo "$f | $title | labels: $labels"; continue; fi
  gh issue create --repo "$REPO" --title "$title" --label "$labels" --body-file "$f"
done
