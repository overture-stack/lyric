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

For database migration:

- Set DB_URL environment variable `export DB_URL=[YOUR_DATABASE_CONNECTION_URL]`
- Run the command `pnpm --filter common migrate`

### Quickstart development

Use command `pnpm dev` to start server running by default in [http://localhost:3000](http://localhost:3000)

## Environment variables

Create a `.env` file based on `.env.schema` located under `apps/server` and set the environment variables for your application.

The Environment Variables used for this application are listed in the table bellow

| Name           | Description                  | Default |
| -------------- | ---------------------------- | ------- |
| `PORT`         | Server Port.                 | 3030    |
| `UPLOAD_LIMIT` | Limit upload file size       | '50mb'  |
| `DB_HOST`      | Database Hostname            |         |
| `DB_PORT`      | Database Port                |         |
| `DB_NAME`      | Database Name                |         |
| `DB_USER`      | Database User                |         |
| `DB_PASSWORD`  | Database Password            |         |
| `LECTERN_URL`  | Schema Service (Lectern) URL |         |
| `LOG_LEVEL`    | Log Level                    | 'info'  |

## Script commands

| Command                         | Description                                                                                                                              |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                      | Start server in dev mode                                                                                                                 |
| `pnpm --filter common generate` | Generate SQL migration files on folder `./packages/common/migrations/`                                                                   |
| `pnpm --filter common migrate`  | Run database migration. It uses DB_URL env variable to connect to the database (example: postgres://user:password@localhost:5432/dbname) |
| `pnpm --filter common dbmlGen`  | Generate DBML file based on Models. Output file on `./packages/common/docs/schema.dbml`                                                  |
| `pnpm build`                    | Compile typescript code                                                                                                                  |
