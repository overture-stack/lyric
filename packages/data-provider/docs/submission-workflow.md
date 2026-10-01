# Submission workflow

This document describes how data moves through an Active Submission in Lyric: how changes are staged, how staged
changes replace or conflict with each other, how the submission is validated, and when it can be committed. It is
written for API users and for developers working on the submission services.

Paths below are relative to the submission router (`/submission` in the reference server).

## Submissions and their statuses

A submission collects staged changes to the submitted data of one category and organization. Each user has at most one
**Active Submission** per category and organization; the staging endpoints find it, or create one with status `OPEN`
when there is none. A submission is active while its status is `OPEN`, `VALID`, `INVALID`, `VALIDATING` or
`COMMITTING`.

| Status       | Meaning                                                                        | Accepts changes | Can be committed |
| ------------ | ------------------------------------------------------------------------------ | --------------- | ---------------- |
| `OPEN`       | Created, or changed since the last validation. A validation job is queued.     | Yes             | No               |
| `VALIDATING` | A validation job is running.                                                   | No              | No               |
| `VALID`      | The last validation found no errors.                                           | Yes             | Yes              |
| `INVALID`    | The last validation found errors.                                              | Yes             | No               |
| `COMMITTING` | A commit is in progress.                                                       | No              | No               |
| `COMMITTED`  | The staged changes were applied to submitted data. The submission is finished. | No              | No               |
| `CLOSED`     | The submission was closed (`DELETE /{submissionId}`) without being committed.  | No              | No               |

Transitions:

- Any change that stages or removes records sets the status to `OPEN` (from `OPEN`, `VALID` or `INVALID`) and queues a
  validation job.
- A validation job moves `OPEN` to `VALIDATING`, then to `VALID` or `INVALID` when it finishes. If validation throws,
  the status goes back to `OPEN`.
- A commit request moves `VALID` to `COMMITTING`. The commit job moves `COMMITTING` to `COMMITTED`, or back to `VALID`
  if it fails after starting.
- Closing moves `OPEN`, `VALID` or `INVALID` to `CLOSED`. Closing a submission in another status requires `force`.

Changes are rejected while the status is `VALIDATING` or `COMMITTING`. Because a validation job is queued after every
change, a change sent shortly after another one can arrive while the first change is being validated and be rejected
with `409`; send it again once validation has finished.

## The version counter

Each submission has a `version`, starting at `0`. It is internal and is not returned by the API.

Every change runs in one database transaction that begins with a single conditional update: it checks that the status
accepts changes, sets the status to `OPEN` and increments the version. That update locks the submission row until the
transaction ends, so changes to the same submission are applied one at a time, and no validation or commit can start
in the middle of a change. The validation job queued after the transaction carries the new version.

Version checks discard stale work:

- A validation job starts only if the submission is `OPEN` with the job's version. Otherwise the submission changed
  after the job was queued, a newer job exists, and this one does nothing.
- A validation result is saved only if the submission is still `VALIDATING` with the validated version. Otherwise the
  result is discarded.
- A commit request moves the status to `COMMITTING` only if the submission is still `VALID` with the version that was
  read when the request arrived, and every record is `VALID`. The commit job carries that version and does nothing if
  the submission no longer has status `COMMITTING` with that version.

## Staged records

Staged changes are stored as submission records. Each record has an action type:

- `INSERT`: a new record, with its data. It has no `systemId`.
- `UPDATE`: a change to a submitted data record, identified by its `systemId`, with the `old` and `new` values of the
  fields that change.
- `DELETE`: the removal of a submitted data record, identified by its `systemId`, with a copy of its data.

Each record belongs to a submission file scoped to one entity. Uploaded files keep their own file; records created by
JSON inserts, edits and deletes are saved in generated files, one per entity affected by the request.

Each record has a state: `RECEIVED` when staged, then `VALID` or `INVALID` after validation.

### Parent and consequence records

Some changes stage more than one record. The record that represents the user's change is the **parent**. The records
staged because of it are its **consequences**, and reference it through `parentRecord`. A parent edit record is a
direct `UPDATE` (with or without `idFieldChange`) or a direct `DELETE`: one whose `parentRecord` is empty.

- **ID field change.** An edit that changes an ID field (a field that another entity references through a foreign key)
  is staged as an `UPDATE` with `idFieldChange = true`. That parent is what the user sees as their edit, but it is not
  applied itself. Its consequences apply it:
  - a `DELETE` of the original record;
  - an `INSERT` of its replacement, with the new values;
  - a foreign key `UPDATE` of each record that references the old value, in its own entity.
- **Delete by systemId.** The `DELETE` of the record is the parent. The `DELETE`s of every record that depends on it,
  found by following foreign keys recursively, are its consequences.

Deleting a parent deletes its consequences. A consequence record cannot be removed on its own.

## Actions that stage or remove data

| Action                    | Endpoint                                        | Stages                                   | Staging               |
| ------------------------- | ----------------------------------------------- | ---------------------------------------- | --------------------- |
| File upload               | `POST /category/{categoryId}/files`             | `INSERT`s, one file per uploaded file    | Background by default |
| JSON insert               | `POST /category/{categoryId}/data`              | `INSERT`s, one generated file per entity | Background            |
| Edit                      | `PUT /category/{categoryId}/data`               | `UPDATE`s, or ID field change groups     | Before the response   |
| Delete by systemId        | `DELETE /category/{categoryId}/data/{systemId}` | A `DELETE` group                         | Before the response   |
| Remove a record or a file | `DELETE /{submissionId}/data`                   | Nothing: removes staged records          | Before the response   |

Validation always runs in the background, after the staging transaction completes.

### File upload and JSON insert

Each row or object is staged as an `INSERT`. Inserts have no `systemId`, so they never replace or conflict with other
staged records; uploading the same data twice stages it twice. File parsing runs before the staging transaction.
Records of several entities in one JSON insert are staged in one transaction, under one version.

Staging happens in the background, after the response. The exception is a file upload with `sync=true`, whose
response waits for parsing and staging so it can return per-file results. If the submission's status does not accept
changes when the request arrives, the response has status `INVALID_SUBMISSION` and nothing is staged. If the status
changes before the records are written, nothing is staged and the rejection is only logged.

### Edit

`PUT /category/{categoryId}/data?entityName=...&organization=...` takes an array of full records of one entity, each
with its `systemId`.

For each record, Lyric compares it with the submitted data:

- If nothing changes, nothing is staged for it, but it still replaces what was staged for that `systemId` (see below).
- If an ID field changes, an ID field change group is staged.
- Otherwise an `UPDATE` is staged.

Within one request, the last record with a given `systemId` wins.

Comparing with the submitted data, finding dependents, replacing staged records, checking for conflicts and writing
the records all run in one transaction, before the response is sent. The response time grows with the number of
dependents of the edited records, which matters most for batches of ID field changes.

When the request changes nothing at all (nothing replaced and nothing staged), the submission is left unchanged and no
validation is queued.

### Delete by systemId

`DELETE /category/{categoryId}/data/{systemId}` stages a `DELETE` group for the record and its dependents. Finding the
dependents, replacing staged records, checking for conflicts and writing the records run in one transaction, before
the response is sent.

When the record already has a `DELETE` staged, the request changes nothing: the response has status `PROCESSING`, a
description saying the record is already staged for deletion, empty `inProcessEntities` and empty `replacedRecords`,
and no validation is queued.

### Remove a record or a file

`DELETE /{submissionId}/data?recordId=...` or `?fileId=...` removes staged records from the submission. It does not
change submitted data.

- `recordId` removes that record. Removing a parent removes its consequences. Removing a consequence record on its own
  is rejected with `400`, naming its parent.
- `fileId` removes the file and its records. When the file holds a parent or a consequence record, the whole group is
  removed, including its records in other files.
- Files left without records by the removal are removed. With `recordId`, the record's own file is kept.
- `recordId` takes precedence when both are given.

## Replacement rules

An incoming parent edit (an edit `UPDATE` or a delete-by-systemId `DELETE`) replaces every parent edit record already
staged for the same entity and `systemId`, whatever the action types:

| Staged                                | Incoming `UPDATE`           | Incoming `DELETE`                     |
| ------------------------------------- | --------------------------- | ------------------------------------- |
| `UPDATE`                              | Replaced                    | Replaced                              |
| ID field change group                 | Replaced, with consequences | Replaced, with consequences           |
| Direct `DELETE` (with any dependents) | Replaced, with consequences | **Unchanged**: the request is a no-op |

Replacing a parent removes its consequence records. Files left without records by the removal are removed.

### `replacedRecords`

The success responses of the edit and delete-by-systemId endpoints always include `replacedRecords`, an array that is
empty when nothing was replaced. It lists only the **parent** records the request discarded, never their consequences.
Each entry has:

- `recordId`: the ID of the discarded submission record;
- `systemId` and `entityName`: the record the change targeted;
- `actionType`: `UPDATE` or `DELETE`;
- `idFieldChange`: whether it was an ID field change;
- `data`: the staged change being discarded (`old`/`new` for an `UPDATE`, the record's data for a `DELETE`).

These are staged changes removed from the submission. Submitted data is never changed by staging; it only changes when
the submission is committed.

## Conflict rules

Conflicts are checked after working out which staged parents the request replaces, so records the request removes do
not count. There are two kinds:

- **`TARGETS_CONSEQUENCE_RECORD`**: a record of the request targets a record that is staged as a consequence of another
  parent. For example, editing a team that is staged for deletion because its sport is being deleted.
- **`CONSEQUENCE_COLLISION`**: a consequence record the request would stage (a dependent's foreign key `UPDATE`, or a
  dependent's `DELETE`) targets a record that is already staged, directly or as the consequence of another parent, or
  that another record of the same request targets. For example, changing a sport's ID while one of its teams has an
  edit staged.

**A `DELETE` overlapping a `DELETE` is never a conflict.** The `DELETE` already staged is kept, and no second one is
staged:

- a direct `DELETE` of a record already staged as a consequence `DELETE` is a no-op for that record, together with
  the `DELETE`s of its own dependents;
- a dependent's `DELETE` is skipped when that record already has a `DELETE` staged, directly or as the consequence of
  another parent, or when the same request deletes it directly.

Any other overlap involving a consequence record is a conflict.

When there is any conflict, the whole request is rejected with `409` and nothing from it is staged, including the
records that do not conflict. The response body lists every conflict:

```json
{
	"error": "Conflict",
	"message": "The request conflicts with changes already staged on the Active Submission. Nothing from the request was staged.",
	"details": {
		"conflicts": [
			{
				"reason": "TARGETS_CONSEQUENCE_RECORD",
				"message": "The UPDATE of system ID 'TM1' in entity 'team' targets record '12', staged as a consequence of record '10'. Remove record '10' from the submission first.",
				"incomingRecord": { "entityName": "team", "systemId": "TM1", "actionType": "UPDATE" },
				"conflictingRecord": { "recordId": 12, "entityName": "team", "systemId": "TM1", "actionType": "DELETE" },
				"parentRecord": {
					"recordId": 10,
					"entityName": "sport",
					"systemId": "SPT1",
					"actionType": "DELETE",
					"idFieldChange": false
				}
			}
		]
	}
}
```

- `incomingRecord` is the record of the request: the parent edit for `TARGETS_CONSEQUENCE_RECORD`, or the consequence
  record it would generate for `CONSEQUENCE_COLLISION`.
- `conflictingRecord` is the record it overlaps. It has a `recordId` when it is already staged, and none when it is
  another record of the same request.
- `parentRecord` is the parent of the consequence record involved: the staged parent of `conflictingRecord` for
  `TARGETS_CONSEQUENCE_RECORD` (remove it to unblock the request), or the parent edit of the request for
  `CONSEQUENCE_COLLISION` (no `recordId`).

The edit and delete-by-systemId endpoints also respond with `409`, without `details`, when the submission's status does
not accept changes.

## Validation

Validation runs in a worker thread, from the job queued after each change. It validates the staged records merged with
all submitted data of the category and organization, against the category's active dictionary:

1. Records where the same `systemId` has both an `UPDATE` and a `DELETE` staged from different groups are marked
   invalid with a `CONFLICTING_ACTION` error and left out of the merge. The staging rules prevent this from happening;
   the check is a safety net for records staged before those rules existed.
2. Submitted data is merged with the staged `INSERT`s, `UPDATE`s and `DELETE`s. Parent `UPDATE`s with
   `idFieldChange` are not applied themselves: their consequence records apply the change.
3. The merged data is validated against the dictionary, including foreign keys across entities.
4. A parent whose consequence records are invalid is marked invalid with one `INVALID_CONSEQUENCE_RECORD` error listing
   them; the detailed errors stay on the consequence records.
5. Each validated record becomes `VALID` or `INVALID`, and the submission becomes `VALID` when there are no errors, or
   `INVALID` otherwise.

## Commit

`POST /category/{categoryId}/commit/{submissionId}` applies the staged changes to submitted data. It requires:

- the submission's status is `VALID`;
- every staged record has state `VALID`;
- no migration is running for the category.

Otherwise it is rejected with `409`. The status and record checks run in the same transaction that moves the status to
`COMMITTING`, with the submission row locked, so nothing can be staged in between. The commit then runs in a worker
thread: it validates again, applies the inserts, updates (except `idFieldChange` parents) and deletes, and sets the
status to `COMMITTED`. If it fails after starting, the status goes back to `VALID`.
