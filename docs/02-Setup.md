# Setup

This guide provides instructions for setting up a complete development environment for Lyric, Overture's tabular data submission service.

## Prerequisites

Before beginning, ensure you have the following installed on your system:

- **PNPM** (package manager, used instead of npm)
- **Node.js** (v20 or higher)
- **Docker** (for running containerized services)

## Development Environment Setup

### 1. Clone the Repository

```bash
git clone https://github.com/overture-stack/lyric.git
cd lyric
```

### 2. Start Dependent Services

Lyric requires a **PostgreSQL** database for data storage and a running **[Lectern](https://docs.overture.bio/develop/Lectern/overview)** service to supply and validate dictionary schemas. The repository ships a `docker-compose.yml` that starts both dependencies (Postgres, plus Lectern and its MongoDB) with development defaults.

```bash
# From the repository root
docker compose up -d
```

<details>
<summary><strong>Dependent Service Details</strong></summary>

| Service          | Port  | Description                          | Purpose                                      |
| ---------------- | ----- | ------------------------------------ | -------------------------------------------- |
| PostgreSQL       | 5432  | Relational database for Lyric        | Stores submitted tabular data and audit history |
| Lectern          | 3000  | Dictionary schema manager            | Supplies and validates the schemas Lyric uses   |
| MongoDB          | 27017 | Backing store for Lectern            | Stores Lectern's dictionaries and versions      |

**Important Notes:**

- Ensure ports 5432, 3000, and 27017 are available on your system.
- Default Postgres credentials: `postgres/secret`, database `lyric`.
- Adjust port configuration if conflicts exist with other services.

</details>

### 3. Install Dependencies

```bash
# Install all dependencies for the entire monorepo
pnpm install
```

### 4. Build the Workspace

```bash
# Compile TypeScript and generate the database schema
pnpm build:all
```

### 5. Configure Environment

Create a `.env` file from the provided schema:

```bash
cp .env.schema .env
```

The populated values in `.env.schema` match the services started in step 2, so a fresh clone runs without further editing. Every variable, what it controls, and its default is documented in [Environment Variables](https://github.com/overture-stack/lyric/blob/main/README.md#environment-variables), which is the single source of truth for configuration.

Kafka publishing is off unless you turn it on: `KAFKA_BROKERS` is blank by default and the bundled `docker-compose.yml` does not start a broker. Set `KAFKA_BROKERS` and `KAFKA_TOPIC` together to publish each commit for [Maestro](https://docs.overture.bio/develop/Maestro/overview) to consume.

### 6. Start the Development Server

```bash
# Runs database migrations, then starts the server with hot reloading
pnpm start:dev
```

The server runs on port `3030` by default.

## Verification & Testing

### API Documentation

Confirm the server is running by opening the interactive API documentation at [Swagger UI](http://localhost:3030/api-docs). Every endpoint below can be exercised from there instead of `curl`.

### Submission Testing

Lyric validates against dictionaries held in Lectern, so a dictionary has to exist in Lectern before Lyric can register it. The Lectern instance started in step 2 is empty on first run.

1. **Upload a dictionary to Lectern.** Lectern's [`simple.json`](https://github.com/overture-stack/lectern/blob/main/samples/dictionary/simple.json) sample defines a single `primitives` schema with one field of each type, which is enough to exercise the whole path:

   ```bash
   curl -sLO https://raw.githubusercontent.com/overture-stack/lectern/main/samples/dictionary/simple.json
   curl -X POST http://localhost:3000/dictionaries \
     -H 'Content-Type: application/json' \
     -d @simple.json
   ```

2. **Register that dictionary against a Lyric category** with `POST /dictionary/register`. `categoryName`, `dictionaryName`, and `dictionaryVersion` are required, and the name and version must match what Lectern holds:

   ```bash
   curl -X POST http://localhost:3030/dictionary/register \
     -H 'Content-Type: application/json' \
     -d '{
       "categoryName": "sample-category",
       "dictionaryName": "Simple",
       "dictionaryVersion": "1.0",
       "defaultCentricEntity": "primitives"
     }'
   ```

   The response carries the `categoryId` used by the remaining steps. The examples below assume `1`.

3. **Download the data file templates** with `GET /dictionary/category/{categoryId}/templates`. Lyric generates one blank file per schema in the registered dictionary, each named after its schema and carrying a header row, and returns them as a zip. No sample data of your own is needed. Templates are tab-separated by default; pass `?fileType=csv` for comma-separated:

   ```bash
   curl -OJ http://localhost:3030/dictionary/category/1/templates
   unzip Simple_1_templates.zip   # contains primitives.tsv
   ```

4. **Submit a completed template** with `POST /submission/category/{categoryId}/files`, sending each file under the `files` form field. `organization` is a required query parameter and groups the submission under a data-owning organization. Fill in a row or two of the template first:

   ```bash
   curl -X POST 'http://localhost:3030/submission/category/1/files?organization=example-org' \
     -F 'files=@primitives.tsv'
   ```

   The response carries a `submissionId` along with any validation errors found. A submission stays staged until committed, so this step is safe to repeat while correcting data.

5. **Commit the submission** with `POST /submission/category/{categoryId}/commit/{submissionId}` to write the validated records to Postgres, substituting the `submissionId` returned above:

   ```bash
   curl -X POST http://localhost:3030/submission/category/1/commit/{submissionId}
   ```

   Confirm the records landed with `GET /data/category/1`, or inspect the audit trail with `GET /audit/category/1/organization/example-org`.

**Troubleshooting:**

- Confirm all three containers are up and healthy: `docker compose ps` should list `lyric.db`, `lyric.lectern.db`, and `lyric.lectern.service` as `running`. Use `docker compose logs -f <service>` to follow a container that exited or is restarting.
- Check that the ports are actually reachable rather than just bound: `curl http://localhost:3030/health` for Lyric and `curl http://localhost:3000/health` for Lectern.
- If Lyric starts but every submission fails validation, confirm `LECTERN_URL` points at the running Lectern service and that the dictionary name and version in your register call match a dictionary Lectern actually holds (`curl http://localhost:3000/dictionaries`).
- Check the server logs for validation or database-migration errors.

:::info Need Help?
If you encounter any issues or have questions about our API, please don't hesitate to reach out through our [**support page**](https://docs.overture.bio/community/support) or our [**discussion forum**](https://github.com/overture-stack/docs/discussions?discussions_q=).
:::

## Development Commands Reference

```bash
# Install dependencies
pnpm install

# Compile TypeScript and generate database schemas
pnpm build:all

# Run database migrations and start the server (development, hot reload)
pnpm start:dev

# Run database migrations and start the server (production, compiled)
pnpm start:prod

# Lint
pnpm lint
pnpm lint:fix

# Test
pnpm test
pnpm test:coverage
```

### Docker Operations

```bash
# Build the Lyric server Docker image
docker build --no-cache -t lyric -f Dockerfile .
```

:::warning
This guide is intended for development purposes only. For production deployments, implement appropriate security measures, configure authentication, and review all environment variables for your specific use case.
:::
