# Data Submission

## Project structure

This is a monorepo project managed by [PNPM](https://pnpm.io/) package manager. It's structured in `apps/` to keep deployable applications and `packages/` to keep libraries.

## Local development

This projects uses:

- [PNPM](https://pnpm.io/) project manager
- [Postgress](https://www.postgresql.org/) database
- [VS Code](https://code.visualstudio.com/) as recommended code editor

### Quickstart Database

For quick start development use `docker-compose up -d` to start postgress database

For database migration use `pnpm --filter common migrate`

### Quickstart development

Use command `pnpm dev` to start server running by default in [http://localhost:3000](http://localhost:3000)

## Environment variables

In each package use the provided `.env.schema` and create an `.env` file.

| Package     | Name           | Description               | Default |
| ----------- | -------------- | ------------------------- | ------- |
| apps/server | `PORT`         | Server Port.              | 3030    |
| apps/server | `DEBUG_MODE`   | Set logger to debug level | false   |
| apps/server | `UPLOAD_LIMIT` | Limit upload file size    | '50mb'  |

## Script commands

| Command                         | Description                  |
| ------------------------------- | ---------------------------- |
| `pnpm dev`                      | Start server in dev mode     |
| `pnpm --filter common generate` | Generate SQL migration files |
| `pnpm --filter common migrate`  | Run database migration       |
| `pnpm build`                    | Compile typescript code      |
