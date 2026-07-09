# Development guide

## Repository structure

```
apps/
  server/          reference Express server; reads from packages/data-provider via workspace dependency
packages/
  data-model/      Drizzle ORM schema + Prisma migrations; DB-layer dependency
  data-provider/   publishable library (@overture-stack/lyric); the main package
    src/
      config/      AppConfig type, logger, DB connection
      core/        provider entry point
      external/    ID generator
      middleware/  auth middleware
      repository/  Drizzle query functions
      routers/     Express routers (submission, submittedData, audit, etc.)
      services/    business logic
      utils/       shared types, errors, utilities
      workers/     worker thread pool (commit and validation workers)
    test/          mocha test suite (unit + integration; co-location preferred for new tests)
```

## Prerequisites

- Node.js >= 20
- pnpm >= 9
- PostgreSQL (for integration tests; Testcontainers spins one up automatically)

## Setup

```sh
pnpm install
cp apps/server/.env.example apps/server/.env   # fill in DB and Lectern config
```

## Running the project

```sh
pnpm start:dev          # migrate + start data-model and server in parallel
```

## Running tests

```sh
pnpm test               # unit tests only (mocha, excludes integration/)
pnpm test:integration   # integration tests (requires Docker for Testcontainers)
pnpm test:coverage      # unit tests with c8 coverage report
```

New tests written during development use `node:test` + `assert` and are co-located with the source file. See `conventions/testing.md`.

## Working documents

The `.dev/` directory contains living documents maintained alongside the codebase:

- `.dev/roadmap.md`: planned features and architectural direction; read at session start
- `.dev/tech-debt.md`: known issues, scope-adjacent problems, and deferred work
- `.dev/sessions.md`: brief session log (done, decisions, open threads)
- `.dev/docs/`: service-specific deployment notes and operational guides; one subdirectory per service

Read the `.dev/` files at the start of each session before beginning work.
