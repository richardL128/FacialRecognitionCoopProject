# CLAUDE.md

Read [AGENTS.md](AGENTS.md) and [CONVENTIONS.md](CONVENTIONS.md) first — they hold the
architecture and code rules. This file covers two things they do not: how to write
explanations for this repo's owner, and the local environment traps that are invisible
in the source.

## How to explain your work

**Name the exact construct.** If it is an `if` block, write "the `if` block". Not
"branch", "guard", "path", or "case". The same applies to `try`/`catch`, `useState`,
a type union, a `catch` block, an HTTP status code, a SQL `WHERE` clause. When a
precise name exists, use it. Substituting a vaguer word forces the reader to guess
which line you mean.

**Cite `file:line` for every claim about the code.** "The `if` block at
`CameraCapturePanel.tsx:776`" is checkable. "The error handling in the panel" is not.

**Describe what the code does, not what it resembles.** Write "this returns HTTP 200
with `status: 'no_match'`". Do not write "this reads as reassurance" or "this launders
the failure". Metaphors about code behaviour waste a sentence and lose the mechanism.

**Show the evidence.** Paste the log line, the HTTP status, the test output. State
measured numbers with their units and where they came from.

**Assume unfamiliarity with the codebase, not with programming.** Explain how this
system's pieces connect — which file calls which endpoint, what a table holds. Do not
explain what a function or a type is.

## Local environment

This repo was first developed on a Windows x86_64 machine and is now worked on from an
Apple Silicon Mac. Most surprises trace back to that.

- **The face service must build for the host architecture.** `services/face-recognizer`
  has no `platform:` pin in `docker-compose.yml`. Do not add one. Pinning
  `linux/amd64` runs torch under QEMU emulation on this Mac, where one `/embed` call
  takes minutes instead of ~0.33s.
- **Torch is installed per architecture.** `requirements.txt` holds the shared
  dependencies; the Dockerfile picks `requirements-torch-amd64.txt` or
  `requirements-torch-arm64.txt` using BuildKit's `TARGETARCH`. `torch==2.5.1+cpu`
  from `download.pytorch.org/whl/cpu` is x86_64-only — on aarch64 the plain PyPI
  `torch==2.5.1` wheel is already CPU-only and is the correct one.
- **`node_modules` may hold native bindings for the wrong OS.** If `npx vitest` fails
  with `Cannot find module '@rolldown/binding-darwin-arm64'`, install that binding with
  `npm install --no-save`. Keep `@rolldown/binding-win32-x64-msvc` installed too — the
  Windows machine needs it. Do not modify `package.json` or `package-lock.json` to fix
  a local-only architecture problem.

## Face recognition

- **`FACE_RECOGNIZER_TIMEOUT_MS` defaults to 7000.** When `/api/camera/recognize` takes
  a multiple of 7 seconds and logs `algorithm: "...-error"`, the embedding service
  timed out. It did not decide anything about the face.
- **Never report a provider failure as a recognition result.** `status: 'no_match'`
  means the face was compared against enrolled embeddings and none passed the
  confidence threshold. A timeout, a 5xx from the face service, or a database error
  must return a 4xx/5xx with an error code — see `FACE_EMBEDDING_ERROR_RESPONSES` in
  `src/app/api/camera/recognize/route.ts`.
- **Enrollment status is employee-specific.** `CameraCapturePanel.tsx` sends the
  PIN-verified employee ID to `/api/camera/recognize`. The route scopes that employee to
  the session tenant and checks their face-library rows, current-model embeddings,
  centroid, and active embedding jobs before returning `not_enrolled`,
  `indexing_in_progress`, or `not_indexed`.
- **`app` runs a production build.** Source edits need `docker compose build app`
  before they take effect in the container.
- **`DEV_BYPASS_AUTH: 'true'`** is set for `app` in `docker-compose.yml`, so endpoints
  can be called directly without a session:
  `curl -F "image=@photo.jpg;type=image/jpeg" http://localhost:3001/api/camera/recognize`
