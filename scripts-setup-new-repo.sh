#!/bin/bash
# Run this once after cloning to initialize a new project from this scaffold.
echo "Initializing project from PayEvo-Base scaffold..."

# Copy env
cp .env.example .env.local
echo "✓ .env.local created — fill in your values"

# Create .cursorrules from llm tuning doc (if using Cursor)
cp .llm/tuning/general_rules.md .cursorrules
echo "✓ .cursorrules created for Cursor"

echo ""
echo "Next steps:"
echo "  1. Fill in .env.local (DATABASE_URL at minimum)"
echo "  2. Update .llm/PROJECT.md with your project details"
echo "  3. Update package.json name field"
echo "  4. Update src/app/layout.tsx metadata (title, description)"
echo "  5. Rename your roles in prisma/schema.prisma and src/lib/permissions/index.ts"
echo "  6. Run: npm install"
echo "  7. Run: npx prisma migrate deploy"
echo "  8. Run: npm run db:seed"
echo "  9. Run: npm run dev"
echo " 10. Read .llm/PROJECT.md before writing any code"
