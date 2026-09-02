# Architecture

## Purpose and boundaries

PayEvo provides an internal dashboard for employee enrolment, camera captures, and assisted face recognition. It is a Next.js application backed by PostgreSQL/pgvector, with a Python face-embedding service and database-backed workers. The UI and API live in one Next.js deployment; recognition inference is a separate container.

```
Browser
  -> Next.js middleware -> App Router pages / API routes -> PostgreSQL + uploads/
                                      |                      ^
                                      v                      |
                              face-recognizer service <- embedding worker
```

## Main flows

### Employee enrolment

1. An authenticated user creates or edits an `EmployeeProfile` through `/api/feature-a/employees`.
2. A photo is uploaded and sanitized before its `CameraCapture` record and stored image are created.
3. Linking the capture to an employee creates an `employee_face_library` entry and queues embedding/training work.
4. The embedding worker claims a job with `FOR UPDATE SKIP LOCKED`, calls the Python `/embed` endpoint, writes the normalized vector, and recomputes the employee centroid.

### Recognition

1. `/api/camera/recognize` sanitizes the probe and asks the face-recognizer for an embedding.
2. The fast path searches tenant- and model-specific employee centroids (stage A).
3. It searches individual enrolled vectors for the shortlisted employees (stage B), then applies confidence and ambiguity thresholds.
4. The route records an audit event and, when supplied, persists the result on the original camera capture.

Only a confident, unambiguous result is a match. A result is not an identity-proofing decision and must not be used as the sole basis for employment, payroll, access control, or similarly high-impact action without a separately approved policy.

## Source of truth

| Concern | Location |
| --- | --- |
| Web pages and API routes | `src/app/` |
| Shared server logic | `src/lib/` |
| UI components | `src/components/` |
| Database schema (generated client contract) | `prisma/schema.prisma` |
| Deployable database changes | `db/migrations/` |
| Operational workers and maintenance jobs | `scripts/` |
| Python inference service | `services/face-recognizer/` |
| Local stack definition | `docker-compose.yml` |

Raw SQL migrations are the deployment source of truth; keep Prisma’s schema aligned with them. Images are presently stored on the local `uploads/` volume, so a production storage boundary has not been established.

## Security boundaries

- Session resolution is centralized in `src/lib/auth/session.ts`. It is currently a development implementation and is a release blocker.
- Every tenant-scoped read and mutation must scope by `tenantId`; return a 404 for a cross-tenant resource rather than revealing it exists.
- API routes use `withApi()` for request IDs, normalized errors, session handling, and feature-flag checks. Route-specific authorization and ownership checks remain the route’s responsibility.
- Images and biometric vectors are Restricted data. Keep them server-side, out of logs and URLs, and protected by an explicit retention/deletion policy before production.
- `middleware.ts` applies headers, kill switches, and an in-memory edge rate limit. Its storage is not shared across instances.

## Operational components

`docker-compose.yml` starts PostgreSQL with pgvector, migrations, a vector backfill, the face-recognizer, the embedding worker, and the app. It is a local development topology, not a production deployment design. `Face_Recognition` holds the training and inference scripts vendored from the Hugging Face repo `biometric-ai-lab/Face_Recognition`; see `Face_Recognition/README.md` for the commit they were copied from.

