# Data Submission

## Project structure

This is a monorepo project managed by [PNPM](https://pnpm.io/) package manager. It's structured in `apps/` to keep deployable applications and `packages/` to keep shared libraries.

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
- [VS Code](https://code.visualstudio.com/) As recommended code editor

### Quickstart development

To setup locally make sure to set following [environtment variables](#environment-variables).

Run `pnpm i` to install dependencies

Use command `pnpm start:dev` described on [script commands](#script-commands-workspace) to start server in development mode running by default in port `3000`

Swagger URL: [http://localhost:3000/api-docs/](http://localhost:3000/api-docs/)

## Environment variables

Create a `.env` file based on `.env.schema` located on the root folder and set the environment variables for your application.

The Environment Variables used for this application are listed in the table bellow

| Name                 | Description                               | Default                      |
| -------------------- | ----------------------------------------- | ---------------------------- |
| `PORT`               | Server Port.                              | 3030                         |
| `UPLOAD_LIMIT`       | Limit upload file size                    | '10mb'                       |
| `DB_HOST`            | Database Hostname                         |                              |
| `DB_PORT`            | Database Port                             |                              |
| `DB_NAME`            | Database Name                             |                              |
| `DB_USER`            | Database User                             |                              |
| `DB_PASSWORD`        | Database Password                         |                              |
| `LECTERN_URL`        | Schema Service (Lectern) URL              |                              |
| `ID_USELOCAL`        | Generate ID locally                       | true                         |
| `ID_CUSTOM_ALPHABET` | Custom Alphabet for local ID generation   | 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' |
| `ID_CUSTOM_SIZE`     | Custom size of ID for local ID generation | 21                           |
| `LOG_LEVEL`          | Log Level                                 | 'info'                       |

## Script commands (Workspace)

| Command           | Description                                                            |
| ----------------- | ---------------------------------------------------------------------- |
| `pnpm build:all`  | Compile typescript code in the workspace and generate database schemas |
| `pnpm start:dev`  | Run database migration and start Server for development                |
| `pnpm start:prod` | Run database migration and start Server for production                 |
