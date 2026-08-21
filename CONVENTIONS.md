# Conventions

## Change discipline

- Read the closest `AGENTS.md` before editing a directory.
- Keep one feature change narrow. Do not fold unrelated formatting, generated output, dataset images, or model artifacts into it.
- Use the scripts already defined in `package.json`; add a script when an operation needs to be repeatable.
- Update `PROGRESS.md` when the implementation state or production blockers materially change. Update `Handoff.md` when a branch/worktree or known issue changes.

## TypeScript and Next.js

- Keep TypeScript strict. Represent external input with Zod schemas and explicit types; do not use `any` to bypass a mismatch.
- Page components are server components unless browser state, events, or browser APIs require a client component. Put `'use client'` at the top of the smallest necessary component.
- Use the `@/` import alias. Components use PascalCase filenames; shared helpers use camelCase filenames; App Router endpoints use `route.ts`.
- Return `apiSuccess`/`apiError` shapes from APIs. Preserve request IDs and map expected failures deliberately.

## Authorization and data

- Obtain the session through the shared API path. Check permission and tenant ownership before reading or mutating a resource.
- Scope every tenant model query with its tenant. Mutations with business significance create an audit entry.
- Treat `uploads/`, employee photos, face embeddings, PINs, tokens, and database URLs as restricted. Never log raw image bytes, vectors, PINs, credentials, or bearer tokens.
- Store PINs only through the hashing helpers. Treat face-match confidence as a probabilistic result, never as a password substitute.

## Database and workers

- Add an ordered, forward-only SQL migration for every schema change. Test it against a clean database and an upgraded database. Keep `prisma/schema.prisma` synchronized.
- Make worker operations idempotent. Claim jobs atomically, keep status transitions observable, and preserve/recompute centroids when embeddings change.
- Do not bypass the upload sanitizer or write arbitrary client data into `uploads/`.

## Verification

- Run the narrowest relevant test first, then `npm test` and a production build for release candidates.
- Exercise authorization failures, cross-tenant access, invalid image input, no-face responses, unavailable recognition service, and ambiguous matches when touching recognition.
- Record commands that cannot run, their reason, and the remaining verification in `Handoff.md` or the pull request.

