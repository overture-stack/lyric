# Tech debt

## Open

### Closing a Submission with `force=true` can relabel a committed Submission as `CLOSED`
fix: In `deleteActiveSubmissionById` (`packages/data-provider/src/services/submission/submissionService.ts`), keep rejecting a Submission that is already `COMMITTED` or `CLOSED` even when `force` is set, and let `force` only add `VALIDATING` and `COMMITTING` to the statuses that can be closed. Do the status check and the update in one conditional update (`updateWithConditions` with `expectedStatuses`), as staging and commit already do. Document in the `ForceDeleteSubmission` Swagger parameter which statuses `force` allows.
standalone: yes
context: Without `force`, only `OPEN`, `VALID` and `INVALID` Submissions can be closed. With `force=true`, the status check is skipped entirely and the status is set to `CLOSED` unconditionally. For a `COMMITTED` Submission, its records are already in Submitted Data, but its status then says it was discarded. Closing a `VALIDATING` or `COMMITTING` Submission with `force` is safe: the running validation or commit checks the status before saving and stops. The check and the update are also two separate queries, so a status change between them is overwritten.

### A dependent record reached through two user records keeps only one parent
fix: Let a system-staged record have more than one parent, for example with a `submission_record_parents` join table instead of the single `submission_records.parent_record_id` column, and remove the child only when its last parent is removed.
standalone: yes
context: When two of a user's records in the same request reach the same dependent record (e.g. a `player` that references two changed parents), `processEditRecordsAsync` stages one dependent update, as `mergeUpdatesBySystemId` already did, and its `parent_record_id` points to the DELETE record of the last of the two. Removing that parent's file removes the dependent update even though the other parent still needs it; removing the other parent's file leaves it staged. Only dictionaries where a schema references more than one parent schema that can change in the same request are affected.

### An ID field edit doesn't update grandchildren that reference a changed field of their parent
fix: In `findUpdateDependents` (`packages/data-provider/src/services/submission/submissionProcessor.ts`), propagate an ID field change one level at a time instead of searching every descendant with `searchDirectDependents`: treat each dependent UPDATE as a change, find the next level with `filterRelationsForPrimaryIdUpdate` using that dependent entity's relations, follow only foreign keys whose referenced field changed, and stop when a level changes no referenced field. Track visited systemIds so a record reachable through two paths is staged once, and make every propagated UPDATE a child of the root's system DELETE so removing the user's file removes the whole chain. This needs `filterRelationsForPrimaryIdUpdate` and `mapGroupedUpdateSubmissionData` (`submissionUtils.ts`) to read the parent's field (`childNode.parent.fieldName`) and write the child's local field, and to handle every mapping of a composite foreign key rather than the first.
standalone: yes
context: `findUpdateDependents` builds update filters only from the edited entity's direct relations, then searches every descendant of the direct dependents. Descendants have no filter, so `mapGroupedUpdateSubmissionData` gives them no update. This is only wrong for a dictionary where a grandchild has a foreign key to a field of its parent that the parent's own foreign key to the edited entity changes (sport → team → player, with `player.team_sport` referencing `team.sport_id`): the player keeps the old value and the edit commits a broken reference, because a foreign key error on unchanged Submitted Data isn't reported (`groupSchemaErrorsByEntity`). No dictionary in use has this relation. A grandchild that also references the edited entity directly is a direct dependent and is updated correctly. The test dictionaries use the same local and foreign field names everywhere, so none of them would catch the field name problem.

### Services throw errors chosen for an HTTP response instead of reporting their own failure
fix: Services report failures in terms of what went wrong in the service, regardless of what triggered it, and controllers map them to the HTTP response, since only the controller knows whether a value came from the client. Split the failures in two: (1) Known, expected outcomes, which covers most current cases: a requested record that doesn't exist, a status that doesn't allow the operation, a staging conflict. Return these through the existing `Result`/`AsyncResult` type in `utils/result.ts` instead of throwing them. The failure data is a discriminated union with a `reason` field for each outcome, so the function signature lists every possible result and callers handle each one through type narrowing, without scanning the function body for `throw` statements or relying on its TSDoc. (2) Unexpected failures, such as a database that can't be reached or data that contradicts an invariant. Keep throwing these, with error types named for the failure rather than for an HTTP status. Audit the services under `packages/data-provider/src/services/`, starting with the submission services, which throw `BadRequest` (400) when a submission ID doesn't exist: `commitSubmission`, `deleteActiveSubmissionById`, `deleteByFileId` and `getSubmissionDetailsById` in `submissionService.ts`, plus the same pattern in `submmittedData.ts`, `submissionProcessor.ts`, `migrationService.ts`, `dictionaryService.ts` and `categoryService.ts`. Clients that rely on a 400 for a missing submission will see a different status code, so changes to the HTTP responses need to be called out in release notes.
standalone: yes
context: Services are called from more than HTTP controllers: the validation and commit workers call `submissionProcessor` directly, and future scheduled tasks will too. A service that picks its error for the HTTP response it expects encodes an assumption about its caller that is wrong in those other contexts. For example, `markSubmissionAsChanged` used to throw `BadRequest` for a missing submission even though every caller has already confirmed the submission exists, so a missing one is an inconsistency, not a client error; it now throws `InternalServerError`. The current error classes in `utils/errors.ts` are named after HTTP statuses and mapped to them in `middleware/errorHandler.ts`, so services have no other vocabulary to use. Doing this properly may mean adding error types named for the failure (for example not found, conflict, inconsistent state) and having controllers or `errorHandler` map them to responses. Of the not-found errors thrown under `services/`, 9 use `BadRequest`, 2 `NotFound`, 1 `InternalServerError` and 5 a plain `Error`. `Result` is already used this way in parts of the codebase: `migrationService.ts` returns `AsyncResult<…, string>`, and `submissionFile.ts` returns `Result<SupportedFileExtension, SubmittedFileError>` with a typed failure. The migration functions use a plain message string as failure data, which can't be narrowed by case, so they would need typed failure data too.

### Migrate off `@overture-stack/sqon-builder` once `@overture-stack/sqon` leaves RC
fix: Replace `@overture-stack/sqon-builder` (`1.1.0`) with `@overture-stack/sqon`. Rewrite `convertSqonToQuery.ts`'s type guards and SQL-generation branches against the new package's schema types (`SqonLeafSchema`/`SqonGroupSchema`/`SqonNode`), adding the operators sqon-builder never had (`notIn`, `someNotIn`, `all`, `gte`, `lte`, `between`, `wildcard`) alongside the existing `in`/`gt`/`lt`. Update `parseSQON` to the named export `SqonBuilder` (`.from()`/`.toValue()`), and `schemas.ts`'s `sqonSchema` to validate against the new schema directly.
standalone: no
context: `sqon-builder` was absorbed into `@overture-stack/sqon` as a builder utility (its `docs/sqon-builder-absorption.md`), confirmed 2026-07-21. Blocked on release status: `latest` is still `1.0.0-rc.1` (no absorbed builder); only `1.0.0-rc.2` (`rc` tag) has it, no stable release yet. Check `npm view @overture-stack/sqon dist-tags` before starting; once `latest` is non-RC, pick this up rather than defer further. Also check its zod version against Lyric's own for conflicts before adding.

### Tests live in `test/` not co-located with source
fix: relocate each spec file into the same directory as the source file it tests, renaming `.spec.ts` to `.test.ts` to match convention. New tests should be co-located from now on; migrating the existing files is a standalone cleanup task, not in scope of feature work.
standalone: yes
context: Convention mismatch: team convention is to co-locate test files with source (`validation.test.ts` next to `validation.ts`), using the `.test.ts` suffix. Lyric's existing suite instead lives entirely under `packages/data-provider/test/{unit,integration}/` (54 spec files total, e.g. `test/unit/external/kafkaPublisher.spec.ts`), using `.spec.ts`. This is a placement issue only; the mocha/chai/sinon runner and style is Lyric's own, confirmed, current convention (see `AGENTS.md` § Project notes), not something to migrate away from.

### Some request body/query param types hand-duplicated instead of derived from their zod schema
fix: convert to `zod.infer`.
standalone: yes
context: `schemas.ts` already uses `zod.infer<typeof schema>` in several places (`CategoryOrganizationPathParams`, `UploadSubmissionQueryParams`, others), but `CategoryPathParams`, `DictionaryRegisterBodyParams`, and `DictionaryRegisterQueryParams` are hand-written next to a schema that could derive them, risking drift. Pre-existing, not touched by the alias work; its own new schemas already follow the pattern.

### No centralised env var validation
fix: add a schema-based startup validation pass (e.g. `zod` on `process.env`) that surfaces all missing/malformed vars at once with a single readable error, rather than each config area failing lazily on first use.
standalone: yes
context: Each config area validates its own env vars lazily (e.g. `getRequiredConfig` throws on use). There is no startup pass that validates all required vars before connections are attempted. `KAFKA_BROKERS`, `KAFKA_TOPIC`, `KAFKA_CLIENT_ID` follow the same lazy pattern.

### Kafka: failed-publish recovery path not documented
fix: document the recovery runbook in `.dev/docs/kafka/` once that directory structure is created (operators can already trigger a full Maestro re-index via the existing pull-based sync, `MAESTRO_REPOSITORIES_0_BASE_URL`); the selective republish endpoint (roadmap) would also address this directly.
standalone: yes
context: When `producer.send` fails after all kafkajs retries, the commit is complete but the records were never sent to the topic. No automated recovery exists today.

### Server logger not passed into AppConfig
fix: have the lyric provider use the server's logger instance rather than constructing its own; requires either `AppConfig` accepting a `Logger` instance (not just `LoggerConfig`), or a way to inject it post-construction.
standalone: yes
context: `server.ts` creates a logger with `getLogger()` and `buildAppConfig()` creates a second one internally from `LoggerConfig`.

### Base image has known high vulnerability
fix: check whether `node:24-alpine` is still flagged; if it is, pin to a patched digest, or upgrade to a newer `node:24-alpine` release once available.
standalone: yes
context: `FROM node:22-alpine` (Dockerfile line 9) was flagged with a high CVE by the IDE linter. The Dockerfile now uses `node:24-alpine`, the Node version pinned in `.nvmrc`, and hasn't been checked against the linter since. Pre-existing, unrelated to Kafka work.

### Category-level admin actions have no privilege check beyond "authenticated"
fix: needs a scope decision (likely an `isAdmin` gate) covering all three call sites together, not a patch to just the new ones.
standalone: no
context: `UserSession` declares `isAdmin`/org-scoped read-write lists, and `authUtils.ts` enforces them, but only the submission/submitted-data controllers call those helpers. Category actions (`dictionaryService.register()`, and now `assignAlias`/`unassignAlias`) have no privilege check beyond authentication; categories aren't organization-scoped, so the existing helpers don't apply directly. Not a regression, assign/unassign matches `register()`'s existing posture, but both are administrative, audit-logged actions worth gating.

### `auditController`'s own "No Records found" check is unreachable dead code
fix: remove the redundant check, or confirm why both exist first.
standalone: yes
context: `byCategoryIdAndOrganization` (`auditController.ts`) throws `NotFound('No Records found')` on zero results, but `auditService.byCategoryIdAndOrganization` already throws its own `NotFound('No data found')` first whenever the query is empty, so the controller's check can never fire. Pre-existing, unrelated to the alias work.

### Sequential numeric category id allows enumeration
fix: not scoped yet; would mean exposing categories only by alias externally, or moving to a non-sequential primary key, both bigger decisions than this entry alone can resolve.
standalone: yes
context: `dictionary_categories.id` is a plain auto-increment `serial`, used directly in URLs and responses, a predictable-identifier smell. The alias feature is a step away from this but doesn't remove or restrict the id.

### Issue #43 ("Sanitize JSON data") covers 3 items; only the SQON one is fixed
standalone: yes
context: #43 lists three items: SQON `fieldName`/`value` sanitization on the query endpoint, TSV-data sanitization before DB insert, and a general other-endpoints input-parameter audit. Only the first is fixed in code today, via parameterized queries in `convertSqonToQuery.ts` and, for the same unescaped-splice-into-`sql.raw()` pattern, `submittedRepository.ts`'s `getSubmittedDataFiltered` (that path is FK-relationship resolution during compound-view reads/submission processing, not literally "the query endpoint" the item names). TSV sanitization and the broader endpoint audit remain untouched and unscoped. Fix: two further, separate efforts — (1) sanitize TSV data before inserting into the database, (2) audit other endpoints' input parameters (path params, query params, etc.) for the same class of issue. #43 should stay open until both land.

---

### No integration tests exist for the submission edit, delete, or commit endpoints — let alone mixed insert+update+delete scenarios
standalone: yes
context: `packages/data-provider/test/integration/routers/submission/` only covers `submissionRouter-submit*` (insert-only file/JSON uploads). There is no integration spec for `editSubmittedData`, `deleteSubmittedDataBySystemId`, or the commit flow (`performCommitSubmissionAsync`/`commitSubmissionWorker.ts`) at all, despite the test infra (`test/integration/dependencies/containers.ts`) already running a real Postgres container capable of exercising the real commit transaction. The new UPDATE/DELETE conflict resolution added 2026-08-12 has unit coverage only (`test/unit/utils/submission/findUpdateDeleteConflicts.spec.ts` and friends) — still no HTTP+DB-level test proving a submission with a staged conflict actually ends up INVALID end-to-end. Fix: add integration specs that stage inserts+updates+deletes in the same active submission (including same-systemId collisions) and assert the committed `submitted_data` table end state and the active submission's status/record states.

### `GET /submission/:submissionId/details` can't filter records by state
standalone: yes
context: `submissionController.ts::getSubmissionDetailsById` (294-321) and `submissionService.ts::getSubmissionDetailsById` (326-372) only accept `entityNames`/`actionTypes` filters (`submissionDetailsRequestSchema`, `schemas.ts:339-351`), then call `submissionRecordsRepository.getBySubmissionId` (365-369) without a `states` filter. The repository itself already supports it — `getBySubmissionId`/`getByFileIds` (`submissionRecordsRepository.ts`) both accept `filterOptions.states?: SubmissionRecordState[]` and `SUBMISSION_RECORD_STATE` (`types.ts`) already enumerates `RECEIVED`/`VALID`/`INVALID` — so this is a plumbing gap, not a missing capability. Fix: add a `states`/`state` query param to `submissionDetailsRequestSchema`, thread it through `getSubmissionDetailsById`'s `filterOptions` in both the controller and service, and pass it to `submissionRecordsRepository.getBySubmissionId`.

### API to download the originally uploaded file
standalone: yes
context: No original file bytes are stored anywhere today. Uploads land in a multer temp path (`dest: '/tmp'`, `submissionRouter.ts:26`), get streamed and parsed by `collectRows` (`fileUtils.ts:62-80`), and the temp file is deleted immediately after parsing (`fileUtils.ts:78`, `fs.unlink`). `submission_files` (`packages/data-model/src/models/submission_files.ts:7-17`) only keeps metadata (`fileName`, `entityName`, `fileSize`); `submission_records` only keeps parsed row data (jsonb), not the raw file. Needs a scope decision before implementation: (a) persist the raw uploaded bytes somewhere (object store or DB blob) at upload time going forward — adds storage/retention cost and doesn't help for submissions already committed under the old behavior, or (b) reconstruct a file from the stored parsed rows — lossy, won't reproduce original column order, formatting, or any extra/ignored columns, and "recreate" may not satisfy whatever this is needed for (audit, re-upload, external sharing). No download/`Content-Disposition` endpoint exists for submission files today; the only precedent for that response pattern in the codebase is `dictionaryController.ts:74-87` (zips dictionary templates, unrelated data).

### Download error report for a file
standalone: no
context: Depends on the storage/identity decision above and needs its own format decision. Per-record errors already exist as `SubmissionRecordError[]` in `submission_records.errors` (jsonb, `packages/data-model/src/models/submission_records.ts:59-73`), and a file already has a stable identity distinct from `entityName` (`submission_files.id`, `submission_records.fileId`) — so per-file error retrieval is possible today via `getBySubmissionId`/`getByFileIds` (`submissionRecordsRepository.ts:34-63,149-177`), just not exposed as a dedicated download endpoint. Open question flagged by the requirement itself: return the raw per-record `errors` JSON as-is, or design a purpose-built report format (e.g. row/field/message table)? Note that line numbers are computed at parse time (`fileUtils.ts:104`, `+1 for header row, +1 for 1-based line numbers`) but aren't currently persisted into the stored `errors` — worth carrying through if the report should reference original file line numbers.

### Download error report as a zip for all files in a submission
standalone: no
context: Depends on the single-file error report above being defined first — this is just "download that report N times, zipped." `jszip` is already a dependency (`package.json:48`) and already used for exactly this response shape (`zip.generateAsync` + `Content-Disposition: attachment` + `application/zip`) in `dictionaryController.ts:74-87`, so no new library or pattern work is needed once the per-file report format exists.

### List submissions endpoint needs sorting and filtering
standalone: yes
context: `GET /submission/category/:categoryId` (`submissionController.ts:233-276`) only accepts `onlyActive`, `organization`, `username` (`submissionsByCategoryRequestSchema`, `schemas.ts:318-329`), plus `page`/`pageSize`. Sort order is hardcoded to `desc(submissions.createdAt)` (`activeSubmissionRepository.ts:216`) with no sort param at all. The mandatory requirement (reverse creation-date sort) already matches today's fixed default — the gap is that it isn't documented as a stable, guaranteed default, and there's no way to choose anything else. Nice-to-have filters not yet supported: study/category beyond the path param, date range (created/updated), creator, contributing users, statuses. `auditRepository.ts` already has a directly reusable pattern for both pieces: date-range filtering (lines 76-81, `lt`/`gt` on `createdAt` against `startDate`/`endDate`) and configurable-direction `orderBy` (line 126), driven by `AuditFilterOptions` (`types.ts:89-98`) — worth modeling the new filter options after that rather than inventing a new shape. Swagger (`submission-api.yml:144-171`) will need the new params documented too.

### `GET /submission/:submissionId` needs richer per-file details
standalone: yes
context: The response (`SubmissionSummaryResponse`, `types.ts:302-305`, built by `createSubmissionSummaryResponse`/`submissionResponseParser.ts:65-78`) groups `inserts`/`updates` by `entityName`, each entry only exposing `batchName` (the original filename), `recordsCount`, and `errors` (a count, not detail) — see `submissionResponseParser.ts:14-58` and the source rows shape in `submissionRecordsRepository.ts:20-26,188-208`. Missing relative to the ask: no `fileId` in the response (so a client can't correlate a listed file to a future per-file download/error-report endpoint, above); no file size, even though `submission_files.fileSize` is already stored in the DB (`submission_files.ts:16`) and just isn't selected by `getRecordsSummaryBySubmissionId` (`submissionRecordsRepository.ts:188-197`); no rolled-up per-file validation status (only an error count — the per-record `state` enum `RECEIVED`/`VALID`/`INVALID` exists at `submission_records.ts:12` but isn't aggregated to file level); `deletes` has no per-file breakdown at all in the current model (`DataDeletesSubmissionSummary` is not batched by file).

### Read endpoints must enforce the user's readable organizations on every path
fix: A non-admin user's readable-organization filter must carry at least one organization clause, so a user with no readable organizations gets no records; an empty combination is not a restriction. `GET /audit/category/{categoryId}/organization/{organization}` checks `hasUserReadAccess` before querying, as the `/data` endpoints with the same path do. Lookups by ID check read access before reporting whether the record exists.
standalone: yes
context: Severity high: fix before the next release. Tests: integration tests for a non-admin user with no readable organizations on `GET /data/category/{categoryId}` and `/stream` (no records), for a user without read access on the audit endpoint (403), and for a by-ID lookup of an existing and a non-existing System ID by a user without access (same status for both).

### `invalidRecords` in the migration list counts every audit record of the migration
fix: In `getMigrationsByCategoryId` (`packages/data-provider/src/services/migrationService.ts`), pass `newIsValid: false` to `getTotalRecordsByCategoryIdAndOrganization`, as `getMigrationById` already does.
standalone: yes
context: `GET /migration/category/{categoryId}` and `GET /migration/{migrationId}` return different `invalidRecords` for the same migration. Once fixed, describe `invalidRecords` as the number of records that are invalid after the migration in `MigrationResult` (`apps/server/swagger/schemas.yml`).

### A dictionary that Lectern doesn't have returns 503 instead of 400
fix: In `fetchDictionaryByVersion` (`packages/data-provider/src/external/lecternClient.ts`), throw the `BadRequest` for an unsuccessful fetch outside the `try`, so only a failed request to Lectern becomes `ServiceUnavailable`. Then document the `400` for an unknown dictionary on `POST /dictionary/register` in `apps/server/swagger/dictionary-api.yml`.
standalone: yes
context: The `BadRequest` is thrown inside the `try` and the `catch` replaces every error with `ServiceUnavailable`, so a wrong dictionary name or version is reported as an outage.

### `DELETE /submission/category/{categoryId}/data/{systemId}` returns `submissionId` as a string
fix: Type `submissionId` as `number` in the result of `deleteSubmittedDataBySystemId` (`packages/data-provider/src/services/submittedData/submmittedData.ts`) and drop the `.toString()` calls, then change `DeleteSubmittedDataResult.submissionId` in `apps/server/swagger/schemas.yml` to `integer`. Call it out in the release notes, since clients reading it as a string will see a number.
standalone: yes
context: Every other endpoint returns `submissionId` as a number.

### Unknown dates and users are returned as `""` on some endpoints and `null` on others
fix: Pick one representation for an unset `createdAt`, `createdBy`, `updatedAt` and `updatedBy`, preferably `null` with ISO 8601 dates, and apply it in `createSubmissionSummaryResponse` (`submissionResponseParser.ts`), `categoryService.getDetails` and the audit response formatter (`auditUtils.ts`), then update the descriptions in `apps/server/swagger/schemas.yml`. Changing `""` to `null` is a breaking change for clients and needs release notes.
standalone: yes
context: Submission, category and audit responses turn a null column into `""` with `_.toString`. Migration responses return `null`.

### Audit `startDate` and `endDate` filters exclude the given instant
fix: Decide whether the filters are inclusive. If they are, use `gte` and `lte` in `getOptionalFilter` (`packages/data-provider/src/repository/auditRepository.ts`), and make a date-only `endDate` include that whole day. Then say in both parameter descriptions in `apps/server/swagger/audit-api.yml` whether the bound is included, and that a date-only value means midnight UTC.
standalone: yes
context: The query uses `gt` and `lt`, so `endDate=2024-01-31` returns no events from that day.

### `GET /migration/{migrationId}/records` accepts `entityNames` and `organizations` but ignores them
fix: Either apply both filters in the migration records query (`dictionaryMigrationRepository.ts`) and document them in `apps/server/swagger/migration-api.yml`, or remove them from `migrationDataRequestSchema` (`packages/data-provider/src/utils/schemas.ts`).
standalone: yes
context: `migrationDataRequestSchema` validates both query parameters, but the query doesn't use them, so a client filtering by them silently gets every record.

### Swagger docs outside the submission endpoints don't match the responses
fix: Correct the category, dictionary, data, audit, migration, validator, health and ping docs in `apps/server/swagger/` against what each controller returns, the way the submission docs were corrected:
- Move the shared `Error` from `components.responses` to `components.schemas` in `schemas.yml`, add its `details` property, fix the `decription` typo, and say in `Forbidden` and `UnauthorizedError` that a rejected token returns only `message`.
- Document 403 on every endpoint (every router uses `authMiddleware`), and give each 400 and 404 a description of what causes it. Drop the codes an endpoint can't return, such as 400 and 404 on `GET /category`.
- `Pagination`: integers, all four fields required.
- `MigrationResult`: status `IN_PROGRESS` (not `IN-PROGRESS`), nullable dates, users and dictionaries. `MigrationChangeHistoryRecord`: `newDataIsValid` and `oldDataIsValid` (not `newIsValid`/`oldIsValid`), nullable `errors`.
- `ChangeHistoryRecord` and `MigrationChangeHistoryRecord.errors`: replace the obsolete `ValidationError` with the dictionary validation error shape (`reason`, `fieldName`, `fieldValue`), already defined as `RecordErrorDetails`. `submissionId` is an integer.
- `RegisterDictionaryResult`: `migrationId` is an integer, absent when the category was just created; drop `allowEmptyValue` and the never-returned `dictionary`.
- `Health`: `uptime` is a number and `timestamp` an int64 integer. `/ping`: document the `{name, version}` body.
- `GET /dictionary`: document the response (`name`, `version`, `schemas`). `GET /data` `view`: explain that `compound` nests related records under the centric entity.
- Spec errors that an OpenAPI 3 validator rejects: the `isInvalid` parameter in `migration-api.yml` has its fields one level too deep, the audit query parameters have no `schema`, and the `/data/.../stream` parameter uses the Swagger 2 `collectionFormat`.
- Use `integer` instead of `number` for IDs and counts, and add `required` lists.
standalone: yes
context: The submission endpoints' docs were corrected in their own change; these were left out to keep that change to the submission endpoints. The shared `Pagination` and `Error` are still in their old form, so the submission endpoints show them that way too. Until the spec errors are fixed, validating the spec needs those paths skipped.

### Swagger parameters are grouped under `path` and `query`, which OpenAPI 3 doesn't allow
fix: Flatten `components.parameters` in `apps/server/swagger/parameters.yml` to one level, renaming the parameters whose names exist in both groups (for example `PathEntityName` and `QueryEntityName`, `PathOrganization` and `QueryOrganization`), and update every `$ref` to them.
standalone: yes
context: Swagger UI resolves the nested refs, but an OpenAPI validator rejects the spec, which blocks generating clients from it or checking responses against it.

### Swagger docs drift from the responses
fix: Add a mocha test that checks the integration tests' real responses against the spec built from `apps/server/swagger/*.yml`, for example with `chai-openapi-response-validator`, so a response change without a docs change fails the build. Needs the parameter flattening above first.
standalone: no
context: The response schemas are written by hand in `apps/server`, while the response types live in `packages/data-provider`, so nothing connects them. Blocked on the parameter flattening entry above.

## Resolved

### Submission endpoints don't accept a categoryId alias, unlike everywhere else
resolved: by 2026-11-24, every `submissionController.ts` handler that takes a `categoryId` resolves it through `resolveCategoryId`, so the submission endpoints accept an alias like the other routers.

### Removing one file of an ID-field edit left the other half of its DELETE + INSERT pair staged
resolved: 2026-10-19, `processEditRecordsAsync` (`packages/data-provider/src/services/submission/submissionProcessor.ts`) now stages every change the user sends as the user's UPDATE, in a single user file. An update to an ID field is marked `applied_by_children` and carried out by a system-generated DELETE and INSERT whose `parent_record_id` is that UPDATE, with the dependent updates as children of the DELETE. The user can only remove the UPDATE's file, which removes the whole chain through `ON DELETE CASCADE`. Validation and commit skip records applied by their children, and `reportChildErrorsOnParents` (`submissionRecordUtils.ts`) reports the DELETE and INSERT errors on the UPDATE.

### Migration 0016 can copy a legacy submission's records into the wrong file
resolved: 2026-10-16, Step 3 of `0016_CUSTOM_migrate_submission_records.sql` now reserves each action/entity bucket's `submission_files` id with `nextval` before inserting it, and Step 5 matches buckets to files on that id instead of on `submission_id`, `file_name` and `entity_name`. Every bucket of a submission shares one `file_name` built from `submissions.created_at`, so the old join matched each bucket to every file of the same entity and inserted its records once per file. File names keep the app's `submission-<timestamp>.json` format. The migration was fixed in place because it had not reached `main`; a database that already ran the old version keeps the duplicated records. No migration test was added, since the integration setup has no way to stop at migration 0015 and load legacy `submissions.data`.

### Agentics `synced` SHA in `AGENTS.md` no longer resolved in the local clone
resolved: 2026-09-10, ran the full reconciliation in `upgrading-adoption.md` § 1 against agentics' current `HEAD` (treated like the "no tag" case per `upstream-check.md`'s troubleshooting note, since the SHA was confirmed unresolvable rather than just stale — clone was current and correctly remoted). Diffed `AGENTS.md`/`CLAUDE.md` directly against the canonical template: added 3 new Interaction-parameters bullets, fixed stale "user"→"developer" and "window"→"workspace" wording, added dispatch-table entries for the new `conventions/git.md` and `conventions/initialization.md` (split out of `session-discipline.md`/`AGENTS.md` upstream, content unchanged), removed the now-duplicated inline Initialization section in favor of the dispatch pointer, and fixed one cosmetic wording diff in `CLAUDE.md`. No conflicting/customized content found — everything was a non-conflicting stale-copy fix, applied as one batch. Also surfaced and answered an unanswered initialization question (agent-index registration), recorded in global context rather than here. Tag updated to `0.20.0 | synced: 2d38a6d0bcb99cd84344a616f952a7421eaec119`.

### Flaky integration test: dictionary migration force-retry intermittently returned 409 instead of 200
resolved: 2026-08-12, made the test wait for the background migration worker to reach a terminal status before mutating it directly, removing the race. `dictionaryMigration.spec.ts`'s "should retry migration..." test now calls a `waitForMigrationToFinish` helper (same polling pattern already used in `dictionaryMigrationData.spec.ts`) right before overwriting the migration's status to `FAILED`, instead of assuming `initiateMigration`'s fire-and-forget worker had already finished. Verified with 3 consecutive full integration-suite runs, 380/380 passing each time, no failures.

### Staging a DELETE submission record never checked for or merged with an existing pending record for the same systemId
resolved: 2026-08-12, added a staging-time check instead of letting one action override the other silently. `resolveDeleteStagingConflicts` (`packages/data-provider/src/utils/submissionUtils.ts`) is now called from `deleteSubmittedDataBySystemId` (`submmittedData.ts`) before any new DELETE record is inserted: it fetches the Active Submission's existing UPDATE/DELETE records and cross-checks them against the systemIds about to be deleted (the target record plus its dependents). A systemId with a pending UPDATE is now rejected outright (`INVALID_SUBMISSION` response, no record staged) — consistent with the "both sides invalid" policy used for the same conflict at validation time — instead of quietly reaching `performDataValidation` later. A systemId that already has a pending DELETE is treated as a duplicate and skipped rather than inserted a second time, addressing the original in-code TODO directly. Previously the function always blindly inserted new DELETE rows regardless of what was already staged.

### Duplicate UPDATE submission records for the same systemId collapsed via undefined last-write-wins at commit time
resolved: 2026-08-12, added a deterministic `ORDER BY` instead of relying on unspecified Postgres row order. `submissionRecordsRepository.ts::getByFileIds` now does `.orderBy(submissionRecords.id)` (ascending) — `id` is a `serial` primary key, monotonic with insertion order, so `commitSubmissionWorker.ts`'s `record[systemId] = record` reduction now deterministically keeps the most recently inserted UPDATE row for a given systemId instead of whichever row Postgres happened to scan last. Considered adding a `created_at` timestamp column instead, but `id` already gives the same ordering guarantee without a schema migration, so that was dropped in favour of the simpler fix.

### UPDATE/DELETE conflict on the same systemId was silently dropped instead of surfaced as an error
resolved: 2026-08-12, added explicit conflict detection ahead of dictionary validation. `findUpdateDeleteConflicts` (`packages/data-provider/src/utils/submissionUtils.ts`) scans staged submission records for entityName+systemId pairs with both an UPDATE and a DELETE, before `performDataValidation` (`submissionProcessor.ts`) runs `validateSchemas`. Conflicting records are excluded from validation, both sides are marked `INVALID` with a new `CONFLICTING_ACTION` error (`RecordErrorActionConflict`, added to `SubmissionRecordError` in `@overture-stack/lyric-data-model`), the active submission is marked `INVALID`, and the scenario is `logger.error`-logged. Previously this was only prevented by incidental JS array-filtering order with no error surfaced (see the still-open items above for what remains: the staging-time TODO, and integration coverage).

### `filterDeletesFromUpdates`/`filterRecordsByConflicts` removed as dead code
resolved: 2026-08-12, same session as the fix above. Once `findUpdateDeleteConflicts` became the real, wired-in conflict detector, the unused `filterRecordsByConflicts`/`filterDeletesFromUpdates` pair (`submissionUtils.ts`, previously lines 234-280) had no remaining reason to exist — deleted both functions and their orphaned spec (`test/unit/utils/submission/filterDeletesFromUpdates.spec.ts`). Confirmed via repo-wide grep that nothing else referenced them before removing.

<!-- Move entries here when addressed, with a note of when and what fixed it -->

### Kafka publish tracking: no unit tests for `createPublishTracker`
resolved: tracker removed in PR #208 (published_at column dropped during review; tracking responsibility deferred)

### SQON `fieldName` has no allowlist against the dictionary schema
resolved: invalid, not tracked. A record's `fieldName`s can legitimately fall outside the *current* dictionary after a migration: `migrationService.ts`'s `performMigrationValidation` re-validates existing records against a new dictionary but never rewrites their stored `data`, so a field the new schema dropped stays present and queryable on old records. Rejecting an unrecognized `fieldName` at query time would break querying that legitimate historical data. Submission-time validation already rejects an unrecognized field on the way in, via Lectern's `UNRECOGNIZED_FIELD` check (`validateRecord.ts`), called from `submissionProcessor.ts` against the category's active dictionary; that's the correct and only place for this check.
