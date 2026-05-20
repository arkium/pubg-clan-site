#!/bin/bash
set -e

echo "Starting pubg-clan-site on Azure App Service..."

# Check if .env exists, if not create it from Azure variables
if [ ! -f .env ]; then
  echo "Creating .env from environment variables..."
  cat > .env << EOF
DATABASE_URL="$DATABASE_URL"
PUBG_API_KEY="$PUBG_API_KEY"
PUBG_BASE_URL="$PUBG_BASE_URL"
NODE_ENV="production"
EOF
fi

# Run Prisma migrations
echo "Running Prisma migrations..."
npx prisma migrate deploy || npx prisma db push

# Generate Prisma client
echo "Generating Prisma client..."
npx prisma generate

# Start the app
echo "Starting Next.js server..."
exec npm start
