# Deployment Runbook

> Update this runbook with your specific hosting platform details.

## Architecture
- **Compute:** [Your platform — e.g. Azure Container Apps, AWS ECS, Vercel]
- **Database:** [Your database hosting — e.g. Azure PostgreSQL, Railway, Supabase]
- **Registry:** [Your container registry — e.g. Azure Container Registry, ECR]
- **ADR:** [ADR-0004](../adr/0004-containerised-deployment.md)

---

## Local Development

### With Docker Compose (full stack)
```bash
docker compose up --build
```
App at http://localhost:3000, PostgreSQL at localhost:5433 (mapped from container 5432).

### Without Docker (Next.js dev server)
```bash
npm run dev
```
Requires a local or remote PostgreSQL and `DATABASE_URL` in `.env.local`.

---

## Environment Variables
| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `IDENTITY_SERVER_URL` | When integrating auth | Your identity provider URL |
| `ENCRYPTION_KEY` | When handling PII | 32-byte hex string |
| `ANTHROPIC_API_KEY` | If using AI features | Anthropic API key (server-side only) |

---

## Build & Push Image
```bash
# Build
docker build -t your-app .

# Tag for your registry
docker tag your-app <registry>/your-app:<version>

# Push
docker push <registry>/your-app:<version>
```

---

## Database Migrations
Run from a machine with network access to the production database:
```bash
DATABASE_URL=<production_url> npx prisma migrate deploy
```

Apply raw SQL migrations manually after Prisma migration:
```bash
psql <production_url> -f db/migrations/audit_log_protection.sql
```

---

## Rollback
See [rollback.md](rollback.md) for rollback procedure.

---

## Health Check
```
GET /api/health/ready
```
