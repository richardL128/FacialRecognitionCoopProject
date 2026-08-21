# `src/app/` guide

This directory follows the Next.js App Router. Route groups organize layouts without changing URLs. API handlers live under `api/**/route.ts`; pages stay in their route folder.

For an API mutation: validate input, resolve the session through the shared API wrapper, check role and tenant ownership, perform the smallest database operation, audit significant changes, and return the standard response shape. Keep `runtime = 'nodejs'` where Node APIs, file storage, Sharp, or server SDKs are required.

For camera routes, preserve the distinction between a capture, an employee enrolment, an embedding job, and a recognition decision. A no-match or ambiguous result must remain a no-match; never manufacture a positive identity.

