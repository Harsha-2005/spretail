#!/bin/bash
set -e
cd backend

if [ -z "$DATABASE_URL" ]; then
  echo "❌ ERROR: DATABASE_URL environment variable is not set."
  echo "   Please add a PostgreSQL database to your Railway project."
  exit 1
fi

echo "✅ DATABASE_URL is set. Installing dependencies..."
npm install --omit=dev
echo "✅ Running prisma db push..."
npx prisma db push --accept-data-loss
echo "✅ Starting server..."
node src/index.js
