# Submission validation

A Submission is validated as a whole, never record by record. Every time its records change, Lyric merges all of the Submission's staged records with the organization's existing Submitted Data and validates the result against the category's active dictionary. A Submission can only be committed once that validation finds no errors.

This page explains when validation runs, what it checks, and how its results are stored and reported. For what happens after validation, see the [commit workflow](../../data-model/docs/submissionCommit.md).

## When validation runs

**Validation runs in the background after every change to a Submission's records.** The request that made the change returns straight away with status `PROCESSING`. Validation never runs during the request itself.

These requests change a Submission's records:

| Request                                                    | Records staged or removed                                                                   |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `POST /submission/category/{categoryId}/files`             | One file of INSERT records per uploaded file                                                |
| `POST /submission/category/{categoryId}/data`              | INSERT records sent as JSON                                                                 |
| `PUT /submission/category/{categoryId}/data`               | UPDATE records editing Submitted Data, plus the records the system stages to carry them out |
| `DELETE /submission/category/{categoryId}/data/{systemId}` | A DELETE record, plus DELETE records for the Submitted Data that depends on it              |
| `DELETE /submission/{submissionId}/data?fileId=`           | Removes a file and every record it caused                                                   |

Each of these does the same three things in one database transaction:

1. Sets the Submission status to `OPEN`.
2. Increments the Submission `version`.
3. Saves or removes the records.

After the transaction, it queues a validation job for that new `version`.

Before staging uploaded files, Lyric also checks each file's headers against its schema. A file missing a required field is rejected and none of its records are staged. This header check is separate from the validation described on this page.

## Submission status and version

**The `version` makes sure a validation result always describes the Submission's current records.** Every change increments it, and each validation job carries the version it was queued for.

Every status and transition is drawn in the [Submission status diagram](../../data-model/docs/stateDiagramSubmissionStatus.md). The rules that matter for validation:

- **Records can only change while the Submission is `OPEN`, `VALID` or `INVALID`.** A request that tries to change records while it is `VALIDATING` or `COMMITTING` stages nothing. Removing a file responds with `409 Conflict`; the other requests respond with status `INVALID_SUBMISSION`.
- **A Submission is closed with `DELETE /submission/{submissionId}`**, while it is `OPEN`, `VALID` or `INVALID`. Closing it in any other status needs `force=true`.
- **A validation job only starts if the Submission is `OPEN` and still at the job's version.** Otherwise the records changed after the job was queued, and a newer job will validate them, so the job does nothing. When several jobs are queued, only the one for the latest version runs.
- **A validation result is only saved if the Submission is still `VALIDATING` at the same version.** If it changed in the meantime, for example because it was closed, the result is discarded.
- **If validation fails unexpectedly**, such as a database error, the status goes back to `OPEN`.

## What a validation job does

1. **Moves the Submission to `VALIDATING`**, checking its status and version in the same update.
2. **Loads every staged record**, plus the organization's Submitted Data for the category.
3. **Leaves out records applied by their children.** See [Records the system stages](#records-the-system-stages) below.
4. **Rejects conflicting actions.** If the same `systemId` has both an UPDATE and a DELETE staged, both records get an error and neither is validated further. Lyric doesn't pick one action over the other.
5. **Merges the records with Submitted Data**, building the data set the category would have once the Submission is committed:
   - Submitted Data being deleted is removed.
   - Submitted Data being updated gets the new values.
   - Inserted records are added.
6. **Validates the merged data with the dictionary**, using the Lectern client. All schemas are validated together, so checks that span schemas, such as foreign keys and unique keys, see the whole data set.
7. **Keeps only the errors on staged records.** Errors on Submitted Data the Submission doesn't change are not reported, because the Submission can't fix them.
8. **Reports each child record's errors on its parent** if the parent is applied by its children, so the user sees the error on the record they sent.
9. **Saves the result:**
   - Each staged record becomes `VALID` or `INVALID`, with its errors.
   - The Submission becomes `VALID` if no record has errors, or `INVALID` otherwise.

DELETE records only get errors from step 4. A DELETE that leaves Submitted Data pointing to the deleted record is caught on that data, which is why deleting a record also stages deletes for the records that depend on it.

## Records the system stages

**Some changes take more records than the user sent.** The system stages those extra records itself, in files marked `is_system_generated`, and links each one to the record that caused it through `parent_record_id`.

Two requests do this:

- **Deleting Submitted Data that other records depend on.** The user's DELETE is staged in a user file. A DELETE for each dependent record is staged in a system-generated file, with the user's DELETE as its parent.
- **Editing a field that other records reference, such as an ID.** The user's UPDATE is staged in a user file. The system carries it out as a DELETE of the old record and an INSERT of the new one, in system-generated files, with the UPDATE as their parent. The UPDATE is marked `applied_by_children`: validation and commit use its DELETE and INSERT instead of it. Records that referenced the old value get an UPDATE in a system-generated file, with the DELETE as their parent.

Example: changing the `sport_id` of sport `SPORT1` from `1` to `2`, when team `TEAM1` references it.

| File         | Origin | Record                                            | Parent           | Validated            |
| ------------ | ------ | ------------------------------------------------- | ---------------- | -------------------- |
| sport UPDATE | user   | `SPORT1`, `sport_id` 1 → 2, `applied_by_children` | none             | through its children |
| sport DELETE | system | `SPORT1` with `sport_id` 1                        | the sport UPDATE | yes                  |
| sport INSERT | system | a new sport with `sport_id` 2                     | the sport UPDATE | yes                  |
| team UPDATE  | system | `TEAM1`, `sport_id` 1 → 2                         | the sport DELETE | yes                  |

What this means for the user:

- **The sport UPDATE is `VALID` only when its DELETE and INSERT are.** Their errors are reported on it, on the line the user sent it on. Errors on the team UPDATE stay on the team UPDATE, because they are about team fields.
- **System-generated files can't be removed by the user.** `DELETE /submission/{submissionId}/data?fileId=` returns `400 Bad Request` for them.
- **Removing the user's file removes everything it caused.** Deleting a record deletes its children, then their children. A system-generated file left with no records is deleted too.

## Line numbers

**Each record's `lineNumber` is its line in what the user submitted.** Line 1 is the header, so the first record is on line 2. This holds for every kind of record:

- Records from an uploaded file keep their line in that file.
- Records sent as JSON are numbered from line 2 in the order they were sent.
- Edits keep the line they were sent on. Records the edit didn't change are not staged, and their line is skipped.
- Records the system stages are numbered from line 2 within their own file.

Records can't be removed one by one, only a whole file at a time. To fix some records in a file, remove the file and submit a corrected one. This keeps every line number matching the file it came from.

## Reading the results

- `GET /submission/{submissionId}` returns the Submission status and a summary per entity and file. Each file lists its record count, its error count, its `fileId` and whether it `isSystemGenerated`.
- `GET /submission/{submissionId}/data` returns the staged records with their `state`, `errors`, `lineNumber`, `fileId` and `parentRecordId`. It can be filtered by action type, entity name and file.

## When a Submission can be committed

`POST /submission/category/{categoryId}/commit/{submissionId}` only accepts a Submission that:

- has status `VALID`;
- has no records in any state other than `VALID`;
- has not changed since the commit was requested.

The commit checks all three in one transaction, and moves the Submission to `COMMITTING` in that same transaction. No records can be staged until the commit finishes. The [commit workflow](../../data-model/docs/submissionCommit.md) describes the rest.
