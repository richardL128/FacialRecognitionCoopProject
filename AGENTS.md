# PayEvo working guide

PayEvo is a multi-tenant employee-photo and face-recognition application. Work from the code and migrations; this repository intentionally avoids a second, generic planning layer.

Before changing a feature, read the scoped `AGENTS.md` in its directory and the applicable root reference:

- [Architecture](ARCHITECTURE.md) for system boundaries and data flow.
- [Conventions](CONVENTIONS.md) for cross-cutting safety and implementation rules.


Run the smallest relevant verification from `package.json`. Do not treat a local development bypass, Docker Compose, seed data, or the existing runbooks as production-ready infrastructure.

