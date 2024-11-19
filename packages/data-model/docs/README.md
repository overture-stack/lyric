# Lyric Data Model

This document provides an overview of the entities and relationships used to manage data submissions, it explains how each entity contributes to organizing, auditing, and validating data, ensuring that submissions adhere to the correct version and structure based on defined dictionary categories.


## Entities
*View full [Data Model](schema.dbml)*


###  - `dictionaries`
Stores individual dictionaries, each containing data schema definitions as JSON objects. 

Key components of the dictionary table include:

- `name`: A descriptive name that identifies the dictionary schema. This allows for easy categorization and retrieval of specific schemas by name.

- `version`: A version identifier that tracks changes and updates to the dictionary schema over time. Versioning ensures that data submissions reference the correct schema version, allowing for backward compatibility and controlled evolution of the schema structure.

- `dictionary`: A JSONB column that stores the full dictionary schema as a JSON object. This schema defines the fields, data types, relationships, and validation rules required for data submissions, providing a flexible and easily accessible format for schema definitions.

> [!NOTE]
> Creating a new dictionary requires [Lectern](https://github.com/overture-stack/lectern) as a Data Dictionary Management Service.


### - `dictionary_categories`
Organizes dictionaries into categories, each specifying a default centric entity to determine data hierarchy.

Key fields in the dictionary_categories table include:

- `active_dictionary_id`: This field references the current, active dictionary version associated with the category. By linking to a specific dictionary entry, this field enables version control, ensuring that all data submissions associated with this category adhere to the latest schema version defined by the active dictionary.

- `name`: The name of the category, which is a unique and descriptive identifier used to label and retrieve the category. This helps users quickly locate the appropriate category and its associated schema for different submission types or data groups.

- `default_centric_entity`: Central entity that defines the primary structure for the data. The central entity compounds the primary entity of the dictionary, nesting its children entities in an array and associating a single parent entity. This hierarchical structure enables complex data relationships to be represented accurately for easy interpretation.


### - `submissions`
Stores data submissions, each associated with a dictionary category and dictionary version.

Key fields in the submissions table include:

- `data`: This field contains the actual submission data stored as a JSON object. The use of JSON allows for flexible and dynamic data structures, accommodating varying submission formats while preserving the integrity of the information.

- `dictionary_category_id`: This field establishes a link to the corresponding dictionary category, which defines the schema against which the submission data will be validated. By referencing the dictionary category, the submission ensures compliance with the rules and structures outlined in the associated dictionary.

- `dictionary_id`: This field links the submission directly to the specific dictionary version being utilized for validation. This connection ensures that the submission is aligned with the correct schema version, enabling consistent validation and data integrity.

- `errors`: This field captures any validation errors encountered during the submission process. It allows for detailed tracking of issues, providing insights into why certain data may not conform to the expected schema.

- `organization`: This field indicates the organization responsible for the submission. This contextual information is essential for data management and auditing purposes, allowing for the tracking of submissions by different entities.

- `status`: This field represents the current state of the submission and can include values such as open, valid, invalid, closed, or committed. The status helps to monitor the submission's lifecycle, ensuring that users can easily identify which submissions are pending, validated, or finalized.

#### What is a Submission?
A Submission is a structured process used to prepare, validate, and commit data for final storage and usage. This process consists of two main steps to ensure data accuracy, completeness, and alignment with specified schema requirements.

1. **Preparation and Validation:** In the initial step, data is organized and validated against a specific dictionary category and schema. During validation, the data is checked to ensure it meets the defined structure and rules for its category. This validation helps catch errors or inconsistencies before data is finalized, allowing for corrections or adjustments if necessary.

2. **Commitment as Submitted Data:** Once validated, the data can then be committed as Submitted Data. This final step solidifies the data submission, converting it into a permanent record that is ready for future retrieval, auditing, or analysis. At this stage, the data is fully compliant with the schema version defined by the referenced dictionary, ensuring consistency across all submitted records.

To view the State diagram for submission status [click here](./stateDiagramSubmissionStatus.md)

To view Submission commit workflow [click here](./submissionCommit.md)


### - `submitted_data`
Stores individual data entries within a submission, capturing their validation status and relationships to specific schemas.

`submitted_data` represents the finalized, validated records from the submission process. Once data passes the initial preparation and validation stages, it is committed as `submitted_data`, becoming a stable and structured record that is ready for storage and future reference.

Key fields in the submitted_data table include:

- `data`: This field contains the submission data stored as a JSON object. Using JSON allows for flexibility in the data structure, accommodating various formats and types of information while preserving the integrity of the submission.

- `entity_name`: This field defines the specific name of the entity associated with the submitted data. It provides context for understanding the type of data being submitted and allows for easier categorization and retrieval based on the entity represented.

- `organization`: This field indicates the organization responsible for the submission. Including this information is crucial for effective data management, as each organization may store distinct and unrelated data.

- `system_id`: This unique identifier distinguishes each entry within the `submitted_data` table. The `system_id` ensures that there are no duplicates, providing a reliable reference point for each record and facilitating easy retrieval and tracking of submissions.

- `is_valid`: This boolean field indicates whether the submitted data is considered valid based on the schema rules defined in the corresponding dictionary. Tracking the validity status is crucial for ensuring data quality and compliance.

- `last_valid_schema_id` and `original_schema_id`: These fields provide references to the schema versions that were used to validate the submission, supporting effective version control and historical tracking of changes.

- **Timestamps and User Metadata**: Fields such as `created_at`, `created_by`, `updated_at`, and `updated_by` capture important metadata about when and by whom the record was created or modified. This information is essential for maintaining a comprehensive audit trail.



### - audit_submitted_data
This table records historical changes to submitted data, providing an audit trail.

Key fields in the audit_submitted_data table include:

- `action`: This field records the type of action performed on the submitted data, represented as an enumerated type (e.g., UPDATE or DELETE)

- `dictionary_category_id`: This field links the audit entry to the corresponding dictionary category associated with the submitted data. It helps contextualize the action within the framework of the defined schema.

- `data_diff`: This field stores a JSON object that captures the differences between the previous and current states of the submitted data. By providing a detailed view of what was changed, this field is essential for tracking modifications and understanding the impact of those changes.

- `entity_name`: This field specifies the name of the entity related to the submitted data, providing additional context for the action logged in the audit entry.

- `last_valid_schema_id`: This field references the schema version that was last validated before the action was taken, ensuring that users can trace back to the applicable schema for the submission.

- `new_data_is_valid`: This boolean field indicates whether the newly submitted data is considered valid according to the schema rules. This status is important for ensuring that only compliant data is retained.

- `old_data_is_valid`: Similar to the previous field, this boolean indicates the validity of the data before the action was taken, allowing for a comparison of data quality over time.

- `organization`: This field identifies the organization responsible for the submission, providing context for the audit entry and aiding in data governance.

- `original_schema_id`: This field references the original schema version used during the initial submission of the data, allowing for a historical perspective on schema changes over time.

- `submission_id`: This field links the audit record to the specific submission, creating a direct connection to the submission responsible for this action.

- `system_id`: A unique identifier for the submitted data, ensuring that each record in the audit trail can be traced back to its corresponding submission.

- `created_at`: This timestamp records when the audit entry was created, providing a chronological context for the logged action.

- `created_by`: This field indicates who performed the action, enhancing accountability by identifying the user responsible for the change.

