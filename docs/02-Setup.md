# Setup

This guide provides instructions for setting up a complete development environment for Lyric, Overture's tabular data submission service.

## Prerequisites

Before beginning, ensure you have the following installed on your system:

- **PNPM** (package manager — used instead of npm)
- **Node.js** (v20 or higher)
- **Docker** (for running containerized services)

## Development Environment Setup

### 1. Dependent Services

Lyric requires a **PostgreSQL** database for data storage and a running **[Lectern](/develop/Lectern/overview)** service to supply and validate dictionary schemas. The repository ships a `docker-compose.yml` that starts both dependencies (Postgres, plus Lectern and its MongoDB) with development defaults.

```bash
# From the repository root
docker-compose up -d
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

### 2. Server Setup

1. **Clone the Repository**

   ```bash
   git clone https://github.com/overture-stack/lyric.git
   cd lyric
   ```

2. **Install Dependencies**

   ```bash
   # Install all dependencies for the entire monorepo
   pnpm install
   ```

3. **Build the Workspace**

   ```bash
   # Compile TypeScript and generate the database schema
   pnpm build:all
   ```

4. **Configure Environment**

   Create a `.env` file based on the provided `.env.schema`:

   ```bash
   cp .env.schema .env
   ```

   A minimal development configuration looks as follows:

   ```env
   # Server
   PORT=3030
   LOG_LEVEL=info

   # PostgreSQL (matches the docker-compose defaults)
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=lyric
   DB_USER=postgres
   DB_PASSWORD=secret

   # Lectern schema service
   LECTERN_URL=http://localhost:3000

   # Local ID generation
   ID_USELOCAL=true
   ID_CUSTOM_ALPHABET=0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ
   ID_CUSTOM_SIZE=21

   # Behaviour flags
   AUDIT_ENABLED=true
   CORS_ENABLED=false
   ALLOWED_ORIGINS=
   PLURALIZE_SCHEMAS_ENABLED=true
   ```

   <details>
   <summary><strong>Environment Variables Reference</strong></summary>

   **Server**

   - `PORT`: Server port (default: 3030)
   - `LOG_LEVEL`: Log verbosity (default: info)

   **PostgreSQL**

   - `DB_HOST`: Database hostname
   - `DB_PORT`: Database port
   - `DB_NAME`: Database name
   - `DB_USER`: Database user
   - `DB_PASSWORD`: Database password

   **Schema Service**

   - `LECTERN_URL`: URL of the Lectern service supplying dictionary schemas

   **ID Generation**

   - `ID_USELOCAL`: Generate record IDs locally (default: true)
   - `ID_CUSTOM_ALPHABET`: Custom alphabet for local ID generation
   - `ID_CUSTOM_SIZE`: Length of locally generated IDs (default: 21)

   **Behaviour**

   - `AUDIT_ENABLED`: Log all modifications to submitted data (default: true)
   - `CORS_ENABLED`: Enable CORS (default: false)
   - `ALLOWED_ORIGINS`: Comma-separated list of permitted CORS origins
   - `PLURALIZE_SCHEMAS_ENABLED`: Automatically pluralize schema names for compound documents (default: true)

   </details>

5. **Start the Development Server**

   ```bash
   # Runs database migrations, then starts the server with hot reloading
   pnpm start:dev
   ```

   The server runs on port `3030` by default.

## Verification & Testing

### API Documentation

Access the interactive API documentation to confirm the server is running:

- **Swagger UI**: `http://localhost:3030/api-docs`

### Submission Testing

1. Navigate to the Swagger UI.
2. Register a Lectern dictionary against a category using the dictionary-registration endpoints.
3. Submit a tabular data file and verify that it is validated against the registered schema.

**Troubleshooting:**

- Ensure PostgreSQL and Lectern are running and reachable at the configured hosts and ports.
- Confirm `LECTERN_URL` points to a running Lectern service.
- Check the server logs for validation or database-migration errors.

:::info Need Help?
If you encounter any issues or have questions about our API, please don't hesitate to reach out through our [**support page**](/community/support) or our [**discussion forum**](https://github.com/overture-stack/docs/discussions?discussions_q=).
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
