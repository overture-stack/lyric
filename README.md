# Data Submission Monorepo

This project is intended to managed as a monorepo using [PNPM](https://pnpm.io/) package manager.

## Project structure

The structure of this monorepo is app centric having `apps/` folder to keep deployable applications while `packages/` folder to keep shared libraries.

```
.
├── apps/
│   └── server
├── packages
│   ├── data-model
│   └── data-provider
```

## System Dependencies

- [Lectern](https://github.com/overture-stack/lectern) Dictionary Management and validation
- [Postgres Database](https://www.postgresql.org/) For data storage

## Local development

### Development tools

- [PNPM](https://pnpm.io/) Project manager
- [Node.js](https://nodejs.org/en) Runtime environment (v20 or higher)
- [VS Code](https://code.visualstudio.com/) As recommended code editor. Plugins recommended: ESLint, Prettier - Code formatter, Mocha Test Explorer, Monorepo Workspace

### Quickstart development

To set up this project locally, follow these steps from the root folder.

1. Install Dependencies:

   Run the following command to install all necessary dependencies:

   ```
   pnpm i
   ```

2. Build the Workspace:

   Use the following command to build the entire workspace:

   ```
   pnpm build:all
   ```

3. Set Environment Variables:

   Refer to the [Environment Variables](#environment-variables) section to configure the required environment variables.

4. Start the Server in Development Mode:

   Once the build is complete, start the server in development mode using the command described in the [Script Commands](#script-commands-workspace) section:

   ```
   pnpm start:dev
   ```

   By default, the server runs on port 3030.

5. Interact with API Endpoints:

   A Swagger web interface is available to interact with the API endpoints. Access it at http://localhost:3030/api-docs/.

## Environment variables

Create a `.env` file based on `.env.schema` located on the root folder and set the environment variables for your application.

The Environment Variables used for this application are listed in the table bellow

| Name                                        | Description                                                                                                                                                                                                                                                                                          | Default                                |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `AUDIT_ENABLED`                             | Ensures that any modifications to the submitted data are logged, providing a way to identify who made changes and when they were made.                                                                                                                                                               | `true`                                 |
| `DB_HOST`                                   | Database Hostname                                                                                                                                                                                                                                                                                    | (empty string)                         |
| `DB_NAME`                                   | Database Name                                                                                                                                                                                                                                                                                        | (empty string)                         |
| `DB_PASSWORD`                               | Database Password                                                                                                                                                                                                                                                                                    | (empty string)                         |
| `DB_PORT`                                   | Database Port                                                                                                                                                                                                                                                                                        | (empty string)                         |
| `DB_USER`                                   | Database User                                                                                                                                                                                                                                                                                        | (empty string)                         |
| `INDEXER_ENABLED`                           | Enables Maestro Indexer                                                                                                                                                                                                                                                                              | `false`                                |
| `INDEXER_CLIENT_BASICAUTH_ENABLED`          | Enables basic authentication for Elasticsearch client                                                                                                                                                                                                                                                | `false`                                |
| `INDEXER_CLIENT_BASICAUTH_PASSWORD`         | Password for basic authentication                                                                                                                                                                                                                                                                    | (empty string)                         |
| `INDEXER_CLIENT_BASICAUTH_USER`             | Username for basic authentication                                                                                                                                                                                                                                                                    | (empty string)                         |
| `INDEXER_CLIENT_CONNECTION_TIMEOUT`         | Timeout (in milliseconds) for establishing a connection                                                                                                                                                                                                                                              | `5000`                                 |
| `INDEXER_CLIENT_DOCS_PER_BULK_REQ_MAX`      | Maximum number of documents per bulk request                                                                                                                                                                                                                                                         | `5000`                                 |
| `INDEXER_NODES`                             | Elasticsearch nodes URL(s)                                                                                                                                                                                                                                                                           | (empty string)                         |
| `INDEXER_CLIENT_RETRY_MAX_ATTEMPTS`         | Maximum number of retry attempts for Elasticsearch client operations                                                                                                                                                                                                                                 | `3`                                    |
| `INDEXER_CLIENT_RETRY_WAIT_DURATION_MILLIS` | Time (in milliseconds) to wait between retry attempts                                                                                                                                                                                                                                                | `500`                                  |
| `INDEXER_VERSION`                           | Version of Elasticsearch to connect to (7 or 8)                                                                                                                                                                                                                                                      | (empty string)                         |
| `ID_CUSTOM_ALPHABET`                        | Custom Alphabet for local ID generation                                                                                                                                                                                                                                                              | `0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ` |
| `ID_CUSTOM_SIZE`                            | Custom size of ID for local ID generation                                                                                                                                                                                                                                                            | `21`                                   |
| `ID_USELOCAL`                               | Generate ID locally                                                                                                                                                                                                                                                                                  | `true`                                 |
| `LECTERN_URL`                               | Schema Service (Lectern) URL                                                                                                                                                                                                                                                                         | (empty string)                         |
| `LOG_LEVEL`                                 | Log Level                                                                                                                                                                                                                                                                                            | `info`                                 |
| `PLURALIZE_SCHEMAS_ENABLED`                 | This feature automatically convert schema names to their plural forms when handling compound documents. Pluralization assumes the words are in English                                                                                                                                               | true                                   |
| `PORT`                                      | Server Port.                                                                                                                                                                                                                                                                                         | `3030`                                 |
| `UPLOAD_LIMIT`                              | Limit upload file size in string or number. <br>Supported units and abbreviations are as follows and are case-insensitive: <br> - b for bytes<br> - kb for kilobytes<br>- mb for megabytes<br>- gb for gigabytes<br>- tb for terabytes<br>- pb for petabytes<br>Any other text is considered as byte | `10mb`                                 |

## Script commands (Workspace)

| Command           | Description                                                            |
| ----------------- | ---------------------------------------------------------------------- |
| `pnpm build:all`  | Compile typescript code in the workspace and generate database schemas |
| `pnpm start:dev`  | Run database migration and start Server for development                |
| `pnpm start:prod` | Run database migration and start Server for production                 |
