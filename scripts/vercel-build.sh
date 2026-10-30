#!/usr/bin/env bash
# Build step for Vercel: set up the database tables, then build the site.
set -euo pipefail

# Neon (added from Vercel's Storage tab) provides DATABASE_URL_UNPOOLED.
# Prisma uses it as DIRECT_URL for migrations.
export DIRECT_URL="${DIRECT_URL:-${DATABASE_URL_UNPOOLED:-$DATABASE_URL}}"

npx prisma migrate deploy

# One-time data load. Turn on by setting SEED_ON_BUILD=true in Vercel,
# redeploy once, then remove the variable. Safe to repeat: prompts that
# already exist are skipped.
if [ "${SEED_ON_BUILD:-}" = "true" ]; then
  echo "SEED_ON_BUILD=true: loading the prompt library..."
  npx tsx prisma/seed.ts
fi

# Free AI search: create search fingerprints for prompts that don't have one yet.
# Keep EMBED_ON_BUILD=true so new prompts become AI-searchable on each deploy
# (only missing ones are processed, so it is quick after the first run).
if [ "${EMBED_ON_BUILD:-}" = "true" ]; then
  echo "EMBED_ON_BUILD=true: creating AI search fingerprints..."
  npx tsx prisma/embed-all.ts
fi

# Give a GitHub user the admin role. Set ADMIN_USERNAME in Vercel.
if [ -n "${ADMIN_USERNAME:-}" ]; then
  npx tsx prisma/promote-admin.ts
fi

npm run build
