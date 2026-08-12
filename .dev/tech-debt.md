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

### Issue #43 ("Sanitize JSON data") covers 3 items; only the SQON one is fixed
standalone: yes
context: #43 lists three items: SQON `fieldName`/`value` sanitization on the query endpoint, TSV-data sanitization before DB insert, and a general other-endpoints input-parameter audit. Only the first is fixed in code today, via parameterized queries in `convertSqonToQuery.ts` and, for the same unescaped-splice-into-`sql.raw()` pattern, `submittedRepository.ts`'s `getSubmittedDataFiltered` (that path is FK-relationship resolution during compound-view reads/submission processing, not literally "the query endpoint" the item names). TSV sanitization and the broader endpoint audit remain untouched and unscoped. Fix: two further, separate efforts — (1) sanitize TSV data before inserting into the database, (2) audit other endpoints' input parameters (path params, query params, etc.) for the same class of issue. #43 should stay open until both land.

---

### No integration tests exist for the submission edit, delete, or commit endpoints — let alone mixed insert+update+delete scenarios
standalone: yes
context: `packages/data-provider/test/integration/routers/submission/` only covers `submissionRouter-submit*` (insert-only file/JSON uploads). There is no integration spec for `editSubmittedData`, `deleteSubmittedDataBySystemId`, or the commit flow (`performCommitSubmissionAsync`/`commitSubmissionWorker.ts`) at all, despite the test infra (`test/integration/dependencies/containers.ts`) already running a real Postgres container capable of exercising the real commit transaction. The new UPDATE/DELETE conflict resolution added 2026-08-12 has unit coverage only (`test/unit/utils/submission/findUpdateDeleteConflicts.spec.ts` and friends) — still no HTTP+DB-level test proving a submission with a staged conflict actually ends up INVALID end-to-end. Fix: add integration specs that stage inserts+updates+deletes in the same active submission (including same-systemId collisions) and assert the committed `submitted_data` table end state and the active submission's status/record states.

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

### SQON `fieldName` has no allowlist against the dictionary schema
resolved: invalid, not tracked. A record's `fieldName`s can legitimately fall outside the *current* dictionary after a migration: `migrationService.ts`'s `performMigrationValidation` re-validates existing records against a new dictionary but never rewrites their stored `data`, so a field the new schema dropped stays present and queryable on old records. Rejecting an unrecognized `fieldName` at query time would break querying that legitimate historical data. Submission-time validation already rejects an unrecognized field on the way in, via Lectern's `UNRECOGNIZED_FIELD` check (`validateRecord.ts`), called from `submissionProcessor.ts` against the category's active dictionary; that's the correct and only place for this check.
