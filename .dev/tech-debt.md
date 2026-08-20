# Tech debt

## Open

### Migrate off `@overture-stack/sqon-builder` once `@overture-stack/sqon` leaves RC
fix: Replace `@overture-stack/sqon-builder` (`1.1.0`) with `@overture-stack/sqon`. Rewrite `convertSqonToQuery.ts`'s type guards and SQL-generation branches against the new package's schema types (`SqonLeafSchema`/`SqonGroupSchema`/`SqonNode`), adding the operators sqon-builder never had (`notIn`, `someNotIn`, `all`, `gte`, `lte`, `between`, `wildcard`) alongside the existing `in`/`gt`/`lt`. Update `parseSQON` to the named export `SqonBuilder` (`.from()`/`.toValue()`), and `schemas.ts`'s `sqonSchema` to validate against the new schema directly.
standalone: no
context: `sqon-builder` was absorbed into `@overture-stack/sqon` as a builder utility (its `docs/sqon-builder-absorption.md`), confirmed 2026-07-21. Blocked on release status: `latest` is still `1.0.0-rc.1` (no absorbed builder); only `1.0.0-rc.2` (`rc` tag) has it, no stable release yet. Check `npm view @overture-stack/sqon dist-tags` before starting; once `latest` is non-RC, pick this up rather than defer further. Also check its zod version against Lyric's own for conflicts before adding.

### Submission endpoints don't accept a categoryId alias, unlike everywhere else
fix: wire `resolveCategoryId` into `submissionController.ts` the same way every other categoryId-accepting router already does.
standalone: yes
context: `submissionController.ts` still parses `categoryId` with raw `Number(req.params.categoryId)` on create/commit/delete. Every other categoryId-accepting router (category, audit, migration, submittedData, validator) resolves id-or-alias via `resolveCategoryId`.

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
fix: pin to a patched digest, or upgrade to a newer `node:22-alpine` release once available.
standalone: yes
context: `FROM node:22-alpine` (Dockerfile line 9) is flagged with a high CVE by the IDE linter. Pre-existing, unrelated to Kafka work.

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
context: The response (`SubmissionSummaryResponse`, `types.ts:302-305`, built by `createSubmissionSummaryResponse`/`submissionResponseParser.ts:65-78`) groups `inserts`/`updates` by `entityName`, each entry only exposing `batchName` (the original filename), `recordsCount`, and `errors` (a count, not detail) — see `submissionResponseParser.ts:14-58` and the source rows shape in `submissionRecordsRepository.ts:20-26,188-208`. Missing relative to the ask: no `fileId` in the response (so a client can't correlate a listed file to a future per-file download/error-report endpoint, above); no file size, even though `submission_files.fileSize` is already stored in the DB (`submission_files.ts:16`) and just isn't selected by `getRecordsSummaryBySubmissionId` (`submissionRecordsRepository.ts:188-197`); no rolled-up per-file validation status (only an error count — the per-record `state` enum `RECEIVED`/`VALID`/`INVALID` exists at `submission_records.ts:12` but isn't aggregated to file level); `deletes` has no per-file breakdown at all in the current model (`DataDeletesSubmissionSummary` is not batched by file). Also found in passing: swagger's `SubmissionDetailsResult` schema (`schemas.yml:87-111`) documents a shape that doesn't match what `/submission/:submissionId/details` actually returns (`SubmissionRecordWithEntityName[]`, i.e. `{id, actionType, state, fileId, data, errors, entityName}[]`) — worth correcting alongside this work since both touch the same response family.

## Resolved

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
