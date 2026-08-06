# Overview

Lyric is a model-agnostic, tabular data submission service designed to manage and validate structured clinical and research data. Built on top of [Lectern's](https://docs.overture.bio/develop/Lectern/overview) dictionary framework, it provides a system for organizations to submit, validate, and manage structured data according to predefined schemas. While primarily used for clinical data management, Lyric's architecture remains domain-agnostic, allowing it to handle any type of structured data that can be defined within a Lectern dictionary.

## Key Features

- **Schema-driven validation:** Uses Lectern dictionaries to enforce data structure and relationships, validating submissions of tabular data files against predefined schemas.
- **Flexible submission workflow:** Provides a staged submission process where users can iteratively update and validate their data before committing to the database.
- **Comprehensive data management:** Offers complete CRUD operations (Create, Read, Update, Delete) through a RESTful API documented in Swagger.
- **Detailed change history:** Maintains a complete audit trail of all data modifications, tracking changes from committed submissions and updates ensuring data governance and accountability.
- **SQON query endpoint:** Provides an endpoint for SQON (Structured Query Object Notation) based queries allowing complex search operations through combinations of simple field operations (`in`, `<=`, `>=`) and logic (`and`, `or`, `not`). This allows complex queries to be expressed in a simple JSON format.
- **Multi-dictionary support:** Handles multiple Lectern dictionaries simultaneously, allowing organizations to manage different data categories with distinct schemas while maintaining data integrity and relationships.

## System Architecture

Lyric manages the submission of tabular data through its API, validating submissions against Lectern dictionary schemas specified on submission.

![Submission System Architecture](./images/submission-system.svg "Updated Overture Submission System")

### Lyric and its required dependencies

Lyric is a single service with two required dependencies:

- **Lyric web API:** an Express-based REST API, documented with Swagger, exposing the submission, validation, query, and data-management endpoints.
- **PostgreSQL:** the backing store for all submitted data and its audit history.
- **[Lectern](https://docs.overture.bio/develop/Lectern/overview):** supplies the dictionary schemas Lyric validates against. Lyric fetches them over HTTP and does not author or store dictionaries itself.

### Overture system integrations

Within a full Overture deployment, two components read from Lyric:

- **[Maestro](https://docs.overture.bio/develop/Maestro/overview):** indexes Lyric's committed records for search. It can pull a full re-index from Lyric's REST API, and it can consume the optional Kafka topic below for incremental updates.
- **[Song](https://docs.overture.bio/develop/Song/overview):** validates file metadata against data already in Lyric, confirming that a submitted record exists before accepting the corresponding file metadata. Lyric exposes configurable endpoints for this, enabled per entity and field through `VALIDATOR_CONFIG`.

### Optional integration: Kafka

When `KAFKA_BROKERS` is set, Lyric publishes each affected record to a Kafka topic on commit, notifying other systems that new data is available. Leave it unset and Lyric runs normally without publishing.

:::info Why Kafka?
Kafka is the standard message queue across Overture, so a single broker serves every component rather than each one inventing its own notification mechanism. It also handles the throughput and durability a bulk submission produces, letting consumers such as Maestro process commits at their own pace instead of being called synchronously.
:::

## Repository Structure

The repository is a [PNPM workspace](https://pnpm.io/workspaces) monorepo, organized with deployable applications under `apps/` and shared libraries under `packages/`:

```
.
├── apps/
│   └── server
└── packages/
    ├── data-model
    └── data-provider
```

[Click here to view the Lyric repository on GitHub](https://github.com/overture-stack/lyric)

- `apps/`: Standalone, deployable processes. Published to [ghcr.io](https://ghcr.io) as container images.
  - `server/`: The Lyric server application, an Express-based REST API (documented with Swagger) exposing the submission, validation, query, and data-management endpoints.
- `packages/`: Reusable libraries shared between applications. Published to [NPM](https://npmjs.com).
  - `data-model/`: The PostgreSQL data model and database migrations (`@overture-stack/lyric-data-model`).
  - `data-provider/`: The core data-access and business-logic library that backs the server, including submission processing, validation, and audit-history handling.
