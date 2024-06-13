> [!NOTE]
> This package is likely not the one you want to use in your project, it is primarily used as a dependency within the Lyric monorepo. [@overture-stack/lyric](https://www.npmjs.com/package/@overture-stack/lyric) is what you are most likely to want to use.

[![NPM Version](https://img.shields.io/npm/v/@overture-stack/lyric?color=%23cb3837&style=for-the-badge&logo=npm)](https://www.npmjs.com/package/@overture-stack/lyric)

# Data Model for Lyric

## Project structure

- [Documentation](#documentation)
- [Migrations](#migrations)
- [Scripts](#scripts)
- [Drizzle Models](#drizzle-models)

## Documentation

`docs/` folder contains general documention about this project.

### Database diagram

Describes the structure of the database illustrating how tables within the database are related to each other.

Check the latest diagram located at [docs/schema.dbml](docs/schema.dbml)

> Used [DBML generator script](#generate-dbml-file) to generate bellow file

A free database visualizer at [dbdiagram.io](https://dbdiagram.io/)

### Submission Status State Diagram

Illustrate the transitions of status on a lifecycle of a Submission

Check the latest diagram located at [docs/stateDiagramSubmissionStatus.md](docs/stateDiagramSubmissionStatus.md)

## Migrations

All migration files are provided under `migrations/` folder.

- SQL Files

  A list of `.sql` files are provided under `migrations/` which contains SQL statements to apply directly to the database.

  File names correspond to the sequential order in which it must be executed.

  You can apply `.sql` files directly to the database or you can use the [migration](#migration-script) script.

- Drizzle Metadata and Journal

  The `meta/` folder contains the migrations history used by Drizzle.

## Scripts

### Generate DBML file

A script [dbmlGenerator.ts](scripts/dbmlGenerator.ts) is provided to generate a DBML file based on the source schema files found at the folder `src/models/`.

To run this script use the command `pnpm run build:dbml`.

### Run Migration

A script [migrate.ts](scripts/migrate.ts) is provided as a helper to run SQL migration files on a specific database.

It executes all the `.sql` files found on `migrations/` folder using Drizzle tools.

Database details are defined via environment variables. Use the variables found on file `.env.schema` as a template.

To run this script use the following command `pnpm run db:migrate:dev`.

## Drizzle Models

Model files are located at `src/models/`.

Follow the [SQL schema declarion](https://orm.drizzle.team/docs/sql-schema-declaration) on Drizzle oficial documentation to create schemas and check the [PostgreSQL available column types](https://orm.drizzle.team/docs/column-types/pg).
