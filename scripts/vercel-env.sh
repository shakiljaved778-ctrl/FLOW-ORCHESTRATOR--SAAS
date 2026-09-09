#!/usr/bin/env bash
#
# Bulk-load environment variables into a linked Vercel project.
#
# Usage:
#   1. Install & log in:   npm i -g vercel && vercel login
#   2. Link the project:   vercel link
#   3. Create an env file (NOT committed) from the template:
#        cp .env.example .env.production.local   # then fill in REAL values
#   4. Run:                bash scripts/vercel-env.sh [environment] [env-file]
#
# Defaults: environment=production, env-file=.env.production.local
#
# Re-running updates existing values (removes then re-adds each key).
set -euo pipefail

TARGET_ENV="${1:-production}"
ENV_FILE="${2:-.env.production.local}"

if ! command -v vercel >/dev/null 2>&1; then
  echo "error: vercel CLI not found. Install with 'npm i -g vercel'." >&2
  exit 1
fi
if [[ ! -f "$ENV_FILE" ]]; then
  echo "error: env file '$ENV_FILE' not found. Copy .env.example and fill it in." >&2
  exit 1
fi

echo "Loading '$ENV_FILE' into Vercel environment: $TARGET_ENV"

while IFS= read -r line || [[ -n "$line" ]]; do
  # Skip blanks and comments.
  [[ -z "${line// }" ]] && continue
  [[ "$line" =~ ^[[:space:]]*# ]] && continue

  key="${line%%=*}"
  value="${line#*=}"
  key="$(echo "$key" | xargs)"   # trim whitespace
  [[ -z "$key" ]] && continue

  # Strip surrounding quotes from the value, if any.
  value="${value%\"}"; value="${value#\"}"

  # Replace any existing value idempotently.
  vercel env rm "$key" "$TARGET_ENV" -y >/dev/null 2>&1 || true
  printf '%s' "$value" | vercel env add "$key" "$TARGET_ENV" >/dev/null
  echo "  set $key"
done < "$ENV_FILE"

echo "Done. Trigger a redeploy for changes to take effect: vercel --prod"
