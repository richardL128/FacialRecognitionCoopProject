# Engineering handoff

Snapshot: 2026-08-20. This document describes the repository as inspected, including in-progress work. It is not a statement that the application is production-ready.

## Executive status

The project is a functioning development prototype for employee enrolment, photo capture, and embedding-based face recognition. Its core technical path exists, but it is not ready to process production biometric data or make production decisions. Authentication, production operations, biometric governance, quality validation, and release verification are still required.

## What remains before production

### Release blockers

1. **Authentication and authorization:** Replace `src/lib/auth/session.ts` development fallback with the approved identity provider. It can currently resolve seeded/first users, including a platform admin. Implement token/session validation, provisioning, logout, MFA/step-up policy as required, and end-to-end tenant/RBAC tests.
2. **Biometric governance:** Obtain legal/privacy review for collection purpose, consent/notice, retention, deletion, access, incident handling, data residency, and a human review/escalation process. Face images, embeddings, and PINs require a formal data inventory and approved controls.
3. **Model validation:** Establish an approved dataset and evaluation protocol. Measure false accept/reject rates by representative cohort and image conditions; calibrate thresholds, test liveness/spoof resistance, define monitoring/drift response, and prohibit unsupported high-impact use.
4. **Production hosting:** Select and provision hosting, managed PostgreSQL/pgvector, encrypted object storage replacing `uploads/`, private networking for the recognizer/worker, registry, secret manager, TLS, least-privilege service accounts, backups, restore tests, and infrastructure-as-code.
5. **Release process:** Add CI for typecheck/lint/tests/build, dependency and container scanning, secret scanning, reviewed migration application, image versioning, environment promotion, observability/alerting, ownership/on-call, and a tested rollback plan.

### Required hardening

- Replace the in-memory rate limiter in `middleware.ts` and `src/lib/rate-limiter.ts` with a shared, failure-aware store for multi-instance deployment.
- Self-host or otherwise make the Open Sans asset available at build time. The 2026-08-20 `npm run build` check failed in a network-restricted environment because `next/font` attempted to fetch it from Google Fonts.
- Migrate the deprecated `middleware.ts` convention to Next.js's current `proxy` convention and resolve the broad file-tracing warning caused by dynamic filesystem use in the training-job import path.
- Complete and exercise the placeholder deployment, rollback, incident-response, data-classification, and threat-model documents under `docs/`.
- Apply and verify database RLS policies if they remain a required defense-in-depth control; current app-level tenant filtering is not a substitute for a reviewed database policy.
- Enforce exact model/image versions and verify their provenance. `Face_Recognition` is a dirty Gitlink with no `.gitmodules` mapping, so its source/ownership must be resolved before a reproducible build is possible.
- Add retention cleanup for stored captures and model artifacts; use durable object storage and protect it with tenant-aware access controls.
- Define worker retry, dead-letter/retry policy, alerting for failed or stuck jobs, and recovery for service/database outage.
- Review API authorization route by route, validate upload limits and malware scanning policy, and ensure security headers/CSP are appropriate for the selected hosting environment.

## Known issues and history

| Area | What happened | Current state / follow-up |
| --- | --- | --- |
| Employee matching | Commit `50957cf` corrected matching behavior while adding photo upload and automatic camera start. | Re-test with real enrolment data after all pending recognition changes are integrated. |
| Camera panel build | Commit `08ca27b` fixed JSX syntax in `CameraCapturePanel`. | Build must run in CI to prevent recurrence. |
| Image hashing | Commit `a30a0fa` changed TypeScript target to ES2020 because the dHash implementation requires `BigInt`. | Keep target compatible with the hash code; include this in build validation. |
| Stale photo metadata | Cleanup work (`919cb79`) addressed database references after an employer/employee photo was deleted. | Preserve cleanup scheduling and test delete-vs-worker races. |
| Recognition scalability | Commit `28dfd81` added embedding jobs, pgvector, centroid-first search, backfills, and recognition-result persistence. | Validate indexes and thresholds under production-sized data; monitor job backlog and vector backfill completion. |
| Ghost embeddings | Embedding upsert/deactivation logic guards against a photo being removed while a worker runs. | Add integration coverage for both races and job retry behavior. |
| PIN gate | Commit `65c5b04` added employee PIN verification to the facial-recognition path. | Confirm product policy: PIN is not an identity-provider replacement; test rate limits and lockout/abuse behavior. |
| Recognition/API hardening WIP | `main` currently has staged changes to recognition routes/tests, middleware, API handler, rate limiter, Python service, Docker, and embedding regeneration. | Review as one change set; tests have not been accepted as a release signal in this handoff. |
| Production build check | `npm run build` reached the app build but failed while downloading Open Sans from Google Fonts in this network-restricted environment. Next.js also warned about the deprecated middleware convention and broad output tracing. | Make font delivery reproducible/offline, migrate the convention, and re-run the production build in CI and the target environment. |

The branch called `agents/camera-capture-fix-bad-request` has a name suggesting a bad-request fix, but its committed tip (`d93c7a5`) is the base scaffold snapshot rather than a separate focused fix. Do not assume there is a cherry-pickable patch merely from the branch name.

## Git branches and worktrees

| Branch | Commit / relationship | Worktree and status | Recommended action |
| --- | --- | --- | --- |
| `main` | `7c8c26a`, ahead of `origin/main` by 8 commits | `C:\Users\rliu\Documents\PayEvo-Projects\PayEvo-Base-clone`; it had 19 staged files, 4 unstaged code/configuration changes, and several untracked application files before this documentation handoff was added | Triage, test, and commit/revert intentionally before sync or release. |
| `origin/main` | `63adb88` | remote tracking baseline | Do not overwrite local history; reconcile through a reviewed PR/merge. |
| `agents/ui-logos-and-design-implementation` | `a30a0fa`; merged into `main` via `7c8c26a` | no separate worktree listed | Keep only if historical branch retention is desired. |
| `agents/facial-recognition-pin-authentication` | `63adb88` | `...PayEvo-Base-clone.worktrees\agents-facial-recognition-pin-authentication`; dirty with modified and untracked camera/PIN/support work | Preserve first. Compare its WIP to `main`; commit, patch, or consciously discard after review. |
| `agents/recognition-pipeline-issue-diagnosis` | `28dfd81`; merged into `main` as part of `d213731` | `...PayEvo-Base-clone.worktrees\agents-recognition-pipeline-issue-diagnosis`; clean when inspected | Its committed work is already in `main`; remove the worktree only after confirming no longer needed. |
| `agents/camera-capture-fix-bad-request` | `d93c7a5` | `...PayEvo-Base-clone.worktrees\agents-camera-capture-fix-bad-request`; heavily dirty with broad scaffold/application changes and untracked assets/data | Treat as an independent recovery workspace. Back it up or commit its useful work before removal. |
| `backup/main-before-sync` | `b56895f` | no worktree listed | Historical recovery point; retain until main and remote history have been reconciled. |

The repository also has `refs/stash` from a worktree migration. Inspect it before any cleanup. Do not delete branches or worktrees with `git worktree remove --force`, `git branch -D`, or `git clean` until the owner has preserved the desired changes.

### Main working tree inventory

Before this documentation handoff update, staged work included `README.md`, Docker/package configuration, the Python recognizer, `scripts/regenerate-face-embeddings.ts`, camera recognition route/tests, camera UI, API handler, rate limiter, and middleware. Unstaged work included `.gitignore`, the dirty `Face_Recognition` Gitlink, `services/face-recognizer/inference.py`, and a simplified Feature A page. Untracked items included `face_recognition_ext/`, dashboard placeholders/settings pages, branding favicon, dashboard tiles, and `src/lib/camera/recognition.ts`.

Keep staged and unstaged changes separate during review. The staged recognition test file is itself new, so it should be run and reviewed with the implementation it exercises.

## Useful commands

```powershell
npm test
npm run build
npm run db:migrate
npm run db:seed
npm run face:embed:worker:once
docker compose up --build
git worktree list --porcelain
git status --short
```

For production migration rehearsal, use a disposable database first. The raw SQL runner (`npm run db:migrate`) applies `db/migrations/`; do not rely on an untested automatic rollback.
