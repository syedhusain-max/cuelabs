#!/usr/bin/env bash
# Build step for Vercel: set up the database tables, then build the site.
set -euo pipefail

# Neon (added from Vercel's Storage tab) provides DATABASE_URL_UNPOOLED.
# Prisma uses it as DIRECT_URL for migrations.
export DIRECT_URL="${DIRECT_URL:-${DATABASE_URL_UNPOOLED:-$DATABASE_URL}}"

npx prisma migrate deploy
npx prisma generate

# Load the free starter prompts (bundled prompts.csv) once.
# Skips itself when the library already has prompts, and creates no logins.
# (Replaces the earlier SEED_ON_BUILD switch, which used prisma/seed.ts and
# created accounts with a shared known password.)
npx tsx prisma/seed-cuelabs.ts

# Give a GitHub user the admin role. Set ADMIN_USERNAME in Vercel.
if [ -n "${ADMIN_USERNAME:-}" ]; then
  npx tsx prisma/promote-admin.ts
fi

npm run build
