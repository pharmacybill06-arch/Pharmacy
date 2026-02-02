#!/usr/bin/env bash
set -e

echo "[entrypoint] NODE_ENV=$NODE_ENV"

# Ensure Prisma client is generated (safe if already generated)
echo "[entrypoint] Generating Prisma client..."
npx prisma generate

# Run migrations in production-safe mode
echo "[entrypoint] Applying database migrations..."
npx prisma migrate deploy

# Start the server
echo "[entrypoint] Starting server..."
exec node src/server.js
