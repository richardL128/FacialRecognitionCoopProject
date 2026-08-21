# Progress

Snapshot: 2026-08-20. This is an implementation ledger, not a speculative roadmap.

## Delivered foundations

- Next.js App Router application with dashboard, feature-flag, employee-photo, camera, and recent-capture surfaces.
- PostgreSQL schema and raw migrations for tenants, users, camera captures, employee profiles, enrolment, training jobs, embeddings, pgvector, centroids, and recognition results.
- Image sanitization, local capture storage, audit logging, feature flags, authorization helpers, structured logging, and a readiness endpoint.
- PIN verification before the recognition flow, employee-image enrolment/removal, cleanup jobs, and database-backed embedding/training work.
- A two-stage recognition design: employee centroids first, then enrolled vectors; confidence and ambiguity thresholds prevent automatic matches on weak evidence.
- Docker Compose development stack containing database, migration, backfill, application, embedding worker, and Python recognition service.

## Current integration state

`main` is ahead of `origin/main` and has a mixed staged/unstaged working tree. The staged work includes recognition-route changes and tests, Python service/Docker changes, rate limiting, embedding regeneration, and camera UI changes. It must be reviewed, tested, and committed as a coherent change set before any release branch is cut. The full inventory and other worktree state are in [Handoff](Handoff.md).

The old scaffold planning, generic LLM prompt, and intern-presentation documents were removed on this snapshot. The active guidance is the root reference files plus scoped `AGENTS.md` files.

## Priority order

1. Stabilize, test, and commit the current working-tree changes; decide whether to retain or discard each external worktree’s work.
2. Replace development authentication with the chosen identity provider and prove tenant/RBAC boundaries through integration tests.
3. Establish biometric governance, secure object storage, secrets, production deployment/monitoring, backups, and incident ownership.
4. Validate recognition quality, bias, spoof resistance, error handling, and human-review policy with representative approved data.
5. Complete release hardening: shared rate limiting, vulnerability/dependency scanning, test coverage, load testing, migration rehearsal, and rollback exercise.

