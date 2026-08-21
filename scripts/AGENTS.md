# `scripts/` guide

Scripts run migrations, backfills, cleanup, exports, and long-running workers. They must be safe to rerun, report progress/failures clearly, and avoid silently deleting or reactivating data outside their explicit scope.

Workers claim database jobs atomically, record terminal status and error information, and keep data changes idempotent. Add a `--once` mode for queue workers where practical so operations can be tested and scheduled predictably.

