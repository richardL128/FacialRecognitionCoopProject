# [Your Project Name] — Base Scaffold

This is the **PayEvo-Base** scaffolding template. Copy and customise this repo to start a new project with all standards pre-configured.

## Quick Start

```bash
cp .env.example .env.local
# Fill in .env.local values

npm install
npm run db:migrate
npm run dev
```

## Face Training Dataset Integration

Employee photo enrollment now mirrors training images into ImageFolder layout automatically:

```text
dataset/
└── <tenant-id>/
    ├── <employee-id-1>/
    │   ├── <capture-id>.jpg
    │   └── ...
    └── <employee-id-2>/
        └── <capture-id>.jpg
```

Notes:

- Add a photo to an employee in Feature A to sync it into the dataset folder.
- Remove a linked employee photo to remove the mirrored training file.
- Default dataset root is `./dataset` and can be overridden with `FACE_TRAINING_DATASET_ROOT`.

Backfill existing DB-linked photos into dataset format:

```bash
npm run dataset:export
# or for a single tenant:
npm run dataset:export -- --tenantId <tenant-uuid>
```

Train command (single tenant):

```bash
python Face_Recognition/finetune.py \
  --data_dir ./dataset/<tenant-uuid> \
  --output_dir ./checkpoints \
  --epochs 50 \
  --batch_size 64 \
  --lr_backbone 8e-6 \
  --lr_head 8e-5
```

Continuous training queue (database-backed):

- Enrolling or removing employee photos now enqueues a tenant training job.
- Jobs are stored in `face_model_training_jobs`.
- Successful model outputs are recorded in `face_model_versions`.

Run one queued job and exit:

```bash
npm run train:model:worker:once
```

Run continuous worker loop:

```bash
npm run train:model:worker
```

Face embedding queue (required for recognition indexing):

- Enrolling employee photos enqueues embedding jobs in `face_embedding_jobs`.
- Recognition quality depends on this worker running continuously.

Run one embedding job and exit:

```bash
npm run face:embed:worker:once
```

Run continuous embedding worker loop:

```bash
npm run face:embed:worker
```

## Local npm + Docker Testing (Both Together)

Use this when you want npm dev server and docker-compose running at the same time.

1. Keep npm app on `http://localhost:3000`
2. Run Docker app on a different host port (default `3010`)
3. Keep Docker Postgres on `5433` (or override with `DB_HOST_PORT`)

Example:

```bash
# Optional port overrides if 3010/5433 are already taken
APP_HOST_PORT=3020 DB_HOST_PORT=5440 docker compose up -d

# npm app uses local .env.local DATABASE_URL
npm run dev
```

Readiness endpoint for diagnostics:

```bash
curl http://localhost:3000/api/health/ready
curl http://localhost:3010/api/health/ready
```

If a request fails, use `x-request-id` from response headers to correlate server logs.

## Docker Operations (Start/Stop/Restart)

Run all commands from the repository root.

### Start

```bash
# Start app + db in background
docker compose up -d

# Start with explicit host ports (use if defaults are occupied)
APP_HOST_PORT=3010 DB_HOST_PORT=5433 docker compose up -d

# Start and rebuild images first
docker compose up -d --build
```

### Stop

```bash
# Stop and remove containers/network
docker compose down

# Stop and remove containers/network + volumes (destructive: removes DB data)
docker compose down -v
```

### Restart

```bash
# Restart all services in place
docker compose restart

# Restart only the web app container
docker compose restart app

# Hard restart (stop, then start fresh)
docker compose down
docker compose up -d
```

### Rebuild

```bash
# Rebuild images using cache
docker compose build

# Rebuild images without cache
docker compose build --no-cache

# Rebuild and restart in one step
docker compose up -d --build
```

### Logs and Status

```bash
# Show running services and mapped ports
docker compose ps

# Follow all logs
docker compose logs -f

# Follow web app logs only
docker compose logs -f app

# Follow database logs only
docker compose logs -f db
```

### Useful One-Liners

```bash
# Start only database (useful when running npm dev locally)
docker compose up -d db

# Stop only web app container
docker compose stop app

# Start web app container again
docker compose start app
```

### Local vs Docker Sync Script

Use this script to align local `.env.local`, run migrations/seeds, rebuild Docker app,
and compare parity across local npm and Docker endpoints.

```powershell
# From repo root
.\sync-local-docker.ps1

# Optional flags
.\sync-local-docker.ps1 -NoCache
.\sync-local-docker.ps1 -SkipSeed
.\sync-local-docker.ps1 -ResetDb
.\sync-local-docker.ps1 -LocalPort 3000 -DockerPort 3010 -DbPort 5433.\sync-local-docker.ps1 -StartLocalNpm

```

Note: keep `npm run dev` running on the local port before the parity check step.
If `-LocalPort` is already mapped by another Docker container (for example `3001`), the script now stops early and tells you to pick your real npm port.
Use `-ResetDb` when Prisma reports migration drift and prompts for a reset.
The script always applies migrations using the raw SQL runner (`scripts/apply-db-migrations.ts`) via `npm run db:migrate`.
If your local app uses a non-default port, start it explicitly, for example: `npm run dev -- --port 3001`.
You can also let the script start npm for you by using `-StartLocalNpm`.

## What's Included

- Next.js 16+ (App Router) with TypeScript strict mode
- KendoReact UI component library
- PostgreSQL + Prisma ORM with soft-delete and audit trail
- Feature flag system (3-tier: global / tenant / client)
- Role-based access control (RBAC) with tenant isolation
- Structured logging (Pino) with PII redaction
- Docker + docker-compose for local dev
- LLM documentation system (`.llm/`) for AI-assisted development

## Key Docs

| Doc                       | Purpose                                             |
| ------------------------- | --------------------------------------------------- |
| `.llm/PROJECT.md`         | Project overview, stack, constraints                |
| `.llm/ARCHITECTURE.md`    | Directory structure, data flow patterns             |
| `.llm/CONVENTIONS.md`     | Code rules — read before writing any code           |
| `.llm/DOMAIN_GLOSSARY.md` | Canonical terminology                               |
| `.llm/tuning/`            | LLM-specific instructions (Claude, Cursor, Copilot) |
| `.llm/skills/`            | Domain skill docs for AI-assisted coding            |
| `.llm/prompts/`           | Reusable prompt templates                           |
| `.legacy/`                | Previous version reference docs, schema, decisions  |
| `docs/adr/`               | Architecture Decision Records                       |
| `docs/security/`          | Threat model, data classification                   |
| `docs/runbooks/`          | Deploy, rollback, incident response                 |

## LLM-Assisted Development

See `.llm/tuning/` for instructions tailored to each AI tool.
Always start a new AI conversation by referencing `.llm/PROJECT.md` and `.llm/CONVENTIONS.md`.

## Customising This Scaffold

1. Update `.llm/PROJECT.md` with your project details
2. Update `.llm/DOMAIN_GLOSSARY.md` with your domain terms
3. Update `package.json` name field
4. Update `src/app/layout.tsx` metadata
5. Add your roles to `prisma/schema.prisma` and `src/lib/permissions/index.ts`
6. Replace placeholder pages in `src/app/(dashboard)/` with real features
7. Fill in `.llm/PLAN.md` with your phased roadmap

## Security Notes

- Never commit `.env.local`
- Sensitive fields are column-encrypted — implement `lib/encryption/` before handling PII
- Audit log is append-only — `UPDATE`/`DELETE` revoked at DB level
- All AI/LLM API calls must be server-side only

# OnCheckerSitePrototype
