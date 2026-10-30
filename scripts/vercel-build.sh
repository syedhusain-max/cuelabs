#!/usr/bin/env bash
# Build step for Vercel: set up the database tables, then build the site.
set -euo pipefail

# Neon (added from Vercel's Storage tab) provides DATABASE_URL_UNPOOLED.
# Prisma uses it as DIRECT_URL for migrations.
export DIRECT_URL="${DIRECT_URL:-${DATABASE_URL_UNPOOLED:-$DATABASE_URL}}"

npx prisma migrate deploy
npm run build
