#!/bin/bash
# Cannabis Dispensary POS — Setup Script
# Run this to install all dependencies and initialize the database

set -e

echo "=== Installing Backend Runtime Dependencies ==="
cd "$(dirname "$0")/backend"
npm install express cors helmet compression jsonwebtoken bcryptjs zod socket.io dotenv

echo ""
echo "=== Installing Frontend Dependencies ==="
cd ../frontend
npm install

echo ""
echo "=== Running Prisma Generate ==="
cd ../backend
npx prisma generate

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. Copy .env.example to .env and fill in JWT_SECRET"
echo "  2. Ensure PostgreSQL is running: pg_isready"
echo "  3. Create database: createdb dispensary_pos"
echo "  4. Run migration: cd backend && npx prisma migrate dev --name init"
echo "  5. Seed data: cd backend && npx prisma db seed"
echo "  6. Start backend: cd backend && npm run dev"
echo "  7. Start frontend: cd frontend && npm run dev"
