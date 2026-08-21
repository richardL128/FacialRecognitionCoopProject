# `db/` guide

`db/migrations/` contains the forward-only production database history. Number migrations sequentially, make each safe to apply once, and include indexes/constraints required by the feature. `db/seeds/` is development-only bootstrap data and must never be a production identity mechanism.

After a migration, align `prisma/schema.prisma`, verify clean and upgrade paths, and rehearse the raw migration runner. Treat destructive data transformations, vector index changes, and audit-log permissions as release work with an explicit backup/rollback plan.

