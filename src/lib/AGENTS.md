# `src/lib/` guide

`lib/` owns cross-route server behavior: authentication, database access, permissions, logging, storage, feature flags, and camera/embedding services. Give each helper one deep contract; routes should orchestrate it rather than duplicate it.

Tenant ID is part of every tenant-scoped operation. Preserve parameterized Prisma/raw SQL usage, explicit failure codes, request-correlated logs, and idempotent worker behavior. Camera helpers must sanitize inputs, normalize/validate embeddings, and keep centroids synchronized when embeddings activate or deactivate.

Changes to session resolution, permissions, storage, or raw SQL have system-wide effect. Add focused tests and describe production impact in the handoff when appropriate.

