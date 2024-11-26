# Lyric

A model-agnostic, tabular data submission system designed to manage and validate submissions. This monorepo contains both the server application and shared libraries, managed using PNPM package manager.

</br>

> 
> <div>
> <img align="left" src="ov-logo.png" height="50"/>
> </div>
> 
> *Lyric is part of [Overture](https://www.overture.bio/), a collection of open-source software microservices used to create platforms for researchers to organize and share genomics data.*
> 
> 

## Local Development

### Development Tools

- [PNPM](https://pnpm.io/) Project manager
- [Node.js](https://nodejs.org/en) Runtime environment (v20 or higher)
- [VS Code](https://code.visualstudio.com/) As recommended code editor. Plugins recommended: ESLint, Prettier - Code formatter, Mocha Test Explorer, Monorepo Workspace

### System Dependencies

- A [Postgres Database](https://www.postgresql.org/) for data storage

### Complementary Services

- [Lectern](https://github.com/overture-stack/lectern) Dictionary Management and validation

### Quickstart Development

1. Install Dependencies:
   ```
   pnpm i
   ```

2. Build the Workspace:
   ```
   pnpm build:all
   ```

3. Set Environment Variables:
   Create a `.env` file based on `.env.schema`. See Environment Variables section below.

4. Start the Server in Development Mode:
   ```
   pnpm start:dev
   ```
   Server runs on port 3030 by default.

5. Interact with API Endpoints:
   Access Swagger UI at http://localhost:3030/api-docs/

### Environment Variables

| Name | Description | Default |
|------|-------------|---------|
| `AUDIT_ENABLED` | Enable logging of data modifications | true |
| `DB_HOST` | Database Hostname | |
| `DB_NAME` | Database Name | |
| `DB_PASSWORD` | Database Password | |
| `DB_PORT` | Database Port | |
| `DB_USER` | Database User | |
| `ID_CUSTOM_ALPHABET` | Custom Alphabet for local ID generation | '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ' |
| `ID_CUSTOM_SIZE` | Custom size of ID for local ID generation | 21 |
| `ID_USELOCAL` | Generate ID locally | true |
| `LECTERN_URL` | Schema Service (Lectern) URL | |
| `LOG_LEVEL` | Log Level | 'info' |
| `PORT` | Server Port | 3030 |
| `UPLOAD_LIMIT` | Limit upload file size | '10mb' |

### Script Commands

| Command | Description |
|---------|-------------|
| `pnpm build:all` | Compile typescript code and generate database schemas |
| `pnpm start:dev` | Run database migration and start Server for development |
| `pnpm start:prod` | Run database migration and start Server for production |

## Documentation

- **[Developer Documentation](https://docs.overture.bio/docs/under-development/lyric/):** Technical resources for developers working with or contributing to the project, located in the `/docs` folder and from our [developer docs website](https://docs.overture.bio/docs/under-development/lyric/).

## Support & Contributions

- For support, feature requests, and bug reports, please see our [Support Guide](https://docs.overture.bio/community/support).

- For detailed information on how to contribute to this project, please see our [Contributing Guide](https://docs.overture.bio/docs/contribution).

## Related Software 

The Overture Platform includes the following Overture Components:

</br>

|Software|Description|
|---|---|
|[Score](https://github.com/overture-stack/score/)| Transfer data to and from any cloud-based storage system |
|[Song](https://github.com/overture-stack/song/)| Catalog and manage metadata associated to file data spread across cloud storage systems |
|[Maestro](https://github.com/overture-stack/maestro/)| Organizing your distributed data into a centralized Elasticsearch index |
|[Arranger](https://github.com/overture-stack/arranger/)| A search API with reusable search UI components |
|[Stage](https://github.com/overture-stack/stage)| A React-based web portal scaffolding |
|[Lyric](https://github.com/overture-stack/lyric)| A model-agnostic, tabular data submission system |
|[Lectern](https://github.com/overture-stack/lectern)| Schema Manager, designed to validate, store, and manage collections of data dictionaries.  |

If you'd like to get started using our platform [check out our quickstart guides](https://docs.overture.bio/guides/getting-started)

## Funding Acknowledgement

Overture is supported by grant #U24CA253529 from the National Cancer Institute at the US National Institutes of Health, and additional funding from Genome Canada, the Canada Foundation for Innovation, the Canadian Institutes of Health Research, Canarie, and the Ontario Institute for Cancer Research.

