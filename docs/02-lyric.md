# Lyric

Lyric is a tabular data management service designed to handle structured clinical and research data. Built on top of Lectern's dictionary framework, it provides a system for organizations to submit, validate, and manage structured data according to predefined schemas. While primarily used for clinical data management, Lyric's architecture remains domain-agnostic, allowing it to handle any type of structured data that can be defined within a Lectern dictionary.

## Key Features

- **Schema-driven validation:** Integrates with Lectern dictionaries to enforce data structure and relationships, validating TSV submissions against predefined schemas.
- **Flexible submission workflow:** Provides a staged submission process where users can iteratively update and validate their data before committing to the database.
- **Comprehensive data management:** Offers complete data lifecycle management through a RESTful API documented in Swagger.
- **Detailed change history:** Maintains a complete audit trail of all data modifications, tracking changes from committed submissions and updates ensuring data governance and accountability.
- **SQON Query Endpoint:** Provides an endpoint for SQON (Structured Query Object Notation) based queries allowing complex search operations through combinations of simple field operations (`in`, `<=`, `>=`) and logic (`and`, `or`, `not`). This allows complex queries to be expressed in a simple JSON format.
- **Multi-dictionary support:** Handles multiple Lectern dictionaries simultaneously, allowing organizations to manage different data categories with distinct schemas while maintaining data integrity and relationships

## System Architecture

Lyric manages the submission of tabular data through its API, validating submissions based on Lectern dictionary schemas stored within Lyric and specified on submission. Song will interact with Lyric to confirm the presence of the data in Lyric's database that corresponds to the file metadata being submitted to Song. All Lyric data is stored on the backend within a PostgreSQL database that will be indexed on publication by Maestro into Elasticsearch documents. 

![Submission System Architecture](./images/submission-system.svg 'Updated Overture Submission System')

:::info Why Elasticsearch?
Storing data in Elasticsearch allows us to build powerful search UI components linked to a flexible GraphQL API facilitated by the Arranger Server. This approach delivers enhanced query performance, advanced full-text search capabilities, and flexible filtering options compared to querying the database directly.
:::

As part of the Overture, Lyric is typically used with additional integrations, including:

- **Lectern:** Validates, stores and manages dictionary schemas fetched, stored, and used by Lyric
- **Maestro:** Handles the indexing of data into elasticsearch on publication events
- **Song & Score:** Facilitates the submission, validation and management of file data in object storage (Score) and the corresponding file metadata (Song) in a database

## Development Roadmap

1. **Authentication System**
   - Implement authentication rules
   - Integrate with Keycloak for identity and access management
2. **Song Integration**
   - Enable Song to validate data registration with Lyric
   - Implement pre-submission file validation checks
3. **Publication Control**
   - Integrate indexing functionality with Maestro V5
   - Enable Lyric & Song data searchability through Arranger interface

## Repository Structure

The structure of this monorepo is app centric having `apps/` folder to keep deployable applications while `packages/` folder to keep shared libraries.

```
.
├── apps/
│   └── server
├── packages
    ├── data-model
    └── data-provider
```

[Click here to view the Lyric repository on GitHub](https://github.com/overture-stack/lyric)

- `app/`: Explanation of directory
    - `server/`: Explanation of directory
- `packages`: Explanation of directory
    - `data-model`: Explanation of directory
    - `data-provider`: Explanation of directory