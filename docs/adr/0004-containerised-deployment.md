# ADR-0004: Containerised Deployment

**Date:** YYYY-MM-DD
**Status:** Accepted

## Context
We need a hosting strategy that is cost-effective, easy to scale,
and — if data residency matters — supports region-locked deployments.

## Decision
Deploy as a Docker container using the included multi-stage `Dockerfile`
with `output: 'standalone'` in `next.config.ts`.

## Rationale
- Container is portable — can run on Azure Container Apps, AWS ECS, Google Cloud Run, etc.
- `standalone` output bundles only the necessary files for a minimal production image
- `docker-compose.yml` provides a consistent local dev environment
- Single image deploys the full Next.js app + API

## Alternatives Considered
- **Vercel:** Easiest deployment, but less control over networking and data residency
- **Railway:** Great for PostgreSQL hosting; less flexible for compute

## Consequences
- CI/CD must build and push the Docker image
- Database migrations run separately: `npx prisma migrate deploy`
- Environment variables injected at runtime via container config
- See `docs/runbooks/deploy.md` for deployment procedure

> Update this ADR with your chosen hosting platform specifics.
