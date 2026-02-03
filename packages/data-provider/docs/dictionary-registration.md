# Dictionary Registration

> Note: [Overture Lyric](https://github.com/overture-stack/lyric) depends on [Overture Lectern](https://github.com/overture-stack/lectern) to fetch dictionaries.

## Overview

A **Dictionary** defines the structure of data to be stored.

Dictionary schemas are fetched from **Lectern** and persisted in the **Lyric database**.

Dictionary registration is responsible for:

- Registering or updating dictionary

- Creating or updating categories

- Triggering data migration

## Dictionary Registration

The `POST /dictionary/register` endpoint allows Lyric to fetch and register dictionary metadata, create a category if required, and set configuration parameters such as the default centric entity.

Request Body:

```json
{
	"categoryName": "string",
	"dictionaryName": "string",
	"dictionaryVersion": "string",
	"defaultCentricEntity": "string"
}
```

### Sequence Diagram:

```mermaid
sequenceDiagram
    actor User
    participant LyricAPI
    participant LyricDB@{ "type" : "database" }
    participant Lectern

    User->>LyricAPI: POST /dictionary/register <br />{categoryName, <br />dictionaryName, <br />dictionaryVersion, <br />defaultCentricEntity}
    Note over LyricAPI: Find or create Dictionary
    LyricAPI->>+Lectern: Fetch dictionary (name + version)
    Lectern-->>-LyricAPI: Dictionary schema response
    break Dictionary name and version not found
        LyricAPI->>User: 400 Bad Request: `Schema with name '${name}' and version '${version}' not found`
    end
    break `defaultCentricEntity` does not exist in Dictionary schema
        LyricAPI->>User: 400 Bad Request: Entity '${defaultCentricEntity}' does not exist in this dictionary
    end
    LyricAPI->>+LyricDB: Query dictionary by dictionaryName + version
    alt Dictionary does not exists
        LyricAPI->>LyricDB: Create new dictionary
    end
    LyricDB-->>-LyricAPI: Return Dictionary

    Note over LyricAPI: Find or create Category
    LyricAPI->>+LyricDB: Query category by categoryName
    break Category is using same dictionary version
        %% Nothing to do here
        LyricAPI->>User: 200 OK: Return Dictionary and Category
    end

    alt Category does not exists
        LyricAPI->>LyricDB: Create new category
    else Category exists but uses different dictionary version
        LyricAPI->>LyricDB: Update category (`dictionary_categories` table) with new Dictionary

        rect rgb(230, 242, 255)
            note over LyricAPI: [Migration] Initiate migration
            LyricAPI->>LyricDB: Create a migration in `category_migration` table<br />(categoryId, fromDictionaryId, toDictionaryId, submissionId, status=IN-PROGRESS, createdAt, createdBy)
            LyricAPI->>LyricDB: Create a new submission (no data, status=COMMITTED)
        end
    end

    LyricAPI->>User: 200 OK: Return Dictionary, Category and migrationId (if required)
    alt
        rect rgb(230, 242, 255)
            note over LyricAPI: [Migration] validation occurs in the brackground
            LyricAPI->>+LyricDB: Retrieve all existing submitted Data in category
            LyricDB-->>-LyricAPI: All Submitted Data in Category
            LyricAPI->>LyricAPI: Validate record against new schema

            loop each record failed validation
                LyricAPI->>LyricDB: Update record in `submitted_data` table, with isValid = FALSE, lastValidSchema
                note over LyricDB: triggers audit table
                LyricAPI->>LyricDB: Insert record in `audit_submitted_data` table with migration error
            end

            alt if Migration fails
                LyricAPI->>LyricDB: Change Migration (`category_migration` table) Status to FAILED
            end

            LyricAPI->>LyricDB: Change Migration (`category_migration` table) Status to COMPLETED
        end
    end
```

## Category Management

A Category is uniquely identified by its case-sensitive `categoryName`.

Category groups data that is related and shares the same data structure, for that reason, a category must be associated to a registered dictionary. Over time, if the dictionary requires an update, the category needs to be updates accordingly, See [Dictionary Migration](#dictionary-migration) for more details.

## Centric entity

Some dictionaries define a centric entity, representing the root of the data model hierarchy (used on compound views).

- `defaultCentricEntity` indicates the parent/root entity for nested data structures.

- It is used when compound data is requested. The system organizes entities by relational dependencies to produce hierarchical JSON.

If omitted or empty:

- The dictionary is considered non-centric and will not produce compound hierarchical responses.

## Dictionary Migration

When a dictionary definition is updated in Lectern, Lyric allows an existing category to be upgraded to use the new dictionary version.

### Migration execution

#### To initiate a dictionary migration:

- Use the registration endpoint `POST /dictionary/register` using the same `categoryName`, and providing a new `dictionaryVersion`.

#### When a migration starts:

- The endpoint returns a `migrationId`, representing a new migration job.

- A migration entry is created with the initial status `IN-PROGRESS`.

- Since migrations run asynchronously, the status is updated to `COMPLETED` once processing finishes.

#### During the migration process:

- All existing records associated to the specified category are revalidated against the updated dictionary schema.

- Each record is evaluated, resulting in:
  - `isValid` property is updated to indicate whether the record still conforms to the new dictionary

  - If record fails:
    - A corresponding audit entry is registered to capture the details validation errors linked to the migration.
