# Tech debt

## Open

### Migrate off `@overture-stack/sqon-builder` once `@overture-stack/sqon` leaves RC
fix: Replace `@overture-stack/sqon-builder` (`1.1.0`) with `@overture-stack/sqon`. Rewrite `convertSqonToQuery.ts`'s type guards and SQL-generation branches against the new package's schema types (`SqonLeafSchema`/`SqonCombinationSchema`/`SqonNode`). Its field operators are `in`, `not-in`, `some-not-in`, `all`, `gt`, `gte`, `lt`, `lte`, `between` and `wildcard`, and its combinations `and`, `or` and `not`, each with an optional `pivot`; Lyric handles `in`, `gt` and `lt` today. Shapes to respect: `wildcard` takes a `fieldNames` list, `between` a two-value list, and `not-in` and `some-not-in` differ only on nested fields (`not-in`: at least one nested item's value is outside the list; `some-not-in`: no nested item's value is in it). Import shape changes too: `SqonBuilder` is a named export (today's `SQONBuilder` is a default export), and `SqonBuilder.from()` takes an object or a JSON string, throws a `ZodError` when the input is invalid, and returns a builder handle needing `.toValue()` to extract the plain `SqonNode`. Update `parseSQON` accordingly: it maps the SQON package's `ZodError` to `BadRequest` and rethrows every other error, so a parse failure never reaches a caller as `undefined`, which callers read as no filter. The package uses zod 4 (see context) and exports zod schemas in its public API, and a zod 4 schema can't nest inside Lyric's zod 3 schemas, so `schemas.ts`'s `sqonSchema` either moves with Lyric to zod 4, or validates the SQON as a separate step (`SqonSchema.safeParse`, or `SqonBuilder.from()` in a try), or validates against `getSqonJsonSchema()`; `parseSQON`'s `ZodError` check must match the zod major the package throws. Empty groups follow the Overture-wide rule stated in the SQON package's README and Arranger's 3.1 migration guide: an empty `and`, `or` or `not` means everything, and a root `and[]` means no filter; a compiler may reject an empty group, as Lyric does, but never reads one as nothing; removing one is allowed only directly under `and`; and an access filter containing an empty group anywhere is refused. Add Lyric's conformance cases for that rule as part of this migration.
standalone: no
context: `sqon-builder` was absorbed into `@overture-stack/sqon` as a builder utility (its `docs/sqon-builder-absorption.md`), confirmed 2026-07-21. Blocked on release status, re-checked 2026-11-03: `latest` is still `1.0.0-rc.1` (predates the absorption) and `rc` is at `1.0.0-rc.6`, no stable release yet. The package's main carries changes since rc.6, so ask its maintainers which release to target rather than assuming the newest RC. Check `npm view @overture-stack/sqon dist-tags` before starting; once `latest` is non-RC, pick this up rather than defer further. zod: through rc.5 the package needed `^3.24.2`, which Lyric's `^3.23.8` satisfies; rc.6 moved to `^4.2.0`, as a regular dependency rather than a peer. Acceptance widens in two ways, confirmed against the rc.6 source: `SqonBuilder.from()` normalizes legacy operator aliases rather than rejecting them (`=`, `==` and `===` become `in`; `!=` and `!==` become `not-in`; `>`, `>=`, `<` and `<=` become `gt`, `gte`, `lt` and `lte`; `filter` becomes `wildcard`), and every node schema keeps unknown keys, which sqon-builder accepts but strips. Confirm with the iMS Submission Service before shipping: its request validation uses `parseSQON`, and this migration widens what `parseSQON` accepts. Ship this together with the next entry.

### An empty readable-organization list matches no submitted data
fix: `filterByOrganizationArray` (`submittedRepository.ts`) compiles an empty organization list to a condition matching no records, so every caller inherits it. An absent list (`undefined`, which `getUserReadableOrganizations` returns for admins and when auth is disabled) keeps meaning every organization. Test: a non-admin user with no readable organizations sees no submitted data from both category-wide reads, `getSubmittedDataByCategory` and `getSubmittedDataByCategoryStream`, and the pagination total is zero.
standalone: no
context: severity high: ship in the same release as the SQON migration above. Until that release ships, commit messages, the PR description and test names state the requirement above and nothing else; the developer holds the detail.

### `in(field, [])` answers 500 instead of matching nothing
fix: `processFilterOperator`'s `isArrayFilter` branch (`convertSqonToQuery.ts`) needs an explicit empty-array case that compiles to a condition matching zero rows, not a thrown error. Do not turn it into a `BadRequest` either: an empty value list is valid input and must compile. Once Lyric supports `not-in`, `not-in(field, [])` on a plain field compiles to a condition matching everything, and on a nested field to one matching the records holding at least one nested item. `all` with an empty list is refused by the SQON schema, so Lyric needn't compile it.
standalone: yes
context: a client sending an `in` filter with an empty value array (`{op:'in',content:{fieldName,value:[]}}`) gets a 500, not an empty result. The `in` branch calls drizzle's `inArray(column, [])`, which throws a plain `Error('inArray requires at least one value')`, and `errorHandler` answers it with its fixed-text 500 and logs it. The field name does not matter: an unknown field fails the same way. It fails closed: no rows are returned. Arranger's SQON reference defines `in` with `[]` as match-none, which no backend may refuse, and `not-in` with `[]` as match-all on a flat field ([An empty value list is not an empty group](https://github.com/overture-stack/arranger/blob/main/docs/reference/04-sqon-in-detail.md#an-empty-value-list-is-not-an-empty-group)); `SqonBuilder.matchNothing(fieldName)` produces exactly that shape. Usher's bridge never sends it: holding no grants is a deny before any filter exists (Usher's `decisions.md`, "Holding no grants is a distinct state, never an empty filter"). It reaches the compiler from any client, today, and from Lyric's own Usher adapter, which uses `matchNothing(fieldName)` as its backstop on any path that builds a filter after a deny, so this fix is required before that adapter ships. The empty-group rule in the migration entry concerns groups, not value lists, so this fix doesn't depend on it. Because `convertSqonToQuery` is public API, a consumer forwarding a client SQON through `parseSQON` into `getSubmittedDataByOrganization` answers the same 500.

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
context: #43 lists three items: SQON `fieldName`/`value` sanitization on the query endpoint, TSV-data sanitization before DB insert, and a general other-endpoints input-parameter audit. Only the first is fixed in code today, via parameterized queries in `convertSqonToQuery.ts` and, for the same unescaped-splice-into-`sql.raw()` pattern, `submittedRepository.ts`'s `getSubmittedDataFiltered` (that path is FK-relationship resolution during compound-view reads/submission processing, not literally "the query endpoint" the item names). TSV sanitization and the broader endpoint audit remain untouched and unscoped. Fix: two further, separate efforts: (1) sanitize TSV data before inserting into the database, (2) audit other endpoints' input parameters (path params, query params, etc.) for the same class of issue. #43 should stay open until both land.

### A dictionary Lectern doesn't have answers 503 instead of a client error
fix: Have `@overture-stack/lectern-client`'s `getDictionary` report Lectern's HTTP status on a failed result; its `Result` type already takes failure data. `src/external/lecternClient.ts`'s `fetchDictionaryByVersion` then checks the result outside its `try`, throws `NotFound` for Lectern's 404 and `ServiceUnavailable` for every other failure, and logs the failed result under `LOG_MODULE`. Registration (`dictionaryService.register`, where the name and version come from the request body) answers `NotFound` with `BadRequest` naming the dictionary. `getDictionaryJson` (`dictionaryController.ts`, where the name and version come from the category's stored dictionary) answers it with `InternalServerError`, saying the problem is in the server's configuration, not in the request. Test: registering a dictionary Lectern doesn't have gets 400; reading a category whose dictionary Lectern no longer has gets 500; Lectern unreachable gets 503 on both.
standalone: no
context: needs a `lectern-client` release that reports the status, and Lyric moving to it from `2.0.0-beta.6`; `latest` is `2.0.0`. Today a failed `getDictionary` result carries only a message, for a dictionary Lectern doesn't have (Lectern answers 404) and for Lectern being unreachable alike, so moving the `BadRequest` out of the `try` on its own would answer an outage 400. A permanent condition answered 503 tells clients to wait and retry, so a request naming a missing dictionary is retried for as long as the client keeps trying.

### A malformed multipart upload answers 500 instead of 400
fix: tell a request that can't be parsed apart from a storage failure on the same upload path, and answer the first with `BadRequest`. Both reach the route as plain `Error`s with no `status`: busboy's parse errors (`Multipart: Boundary not found`, `Unexpected end of form`, `Malformed part header`), and disk storage's own failures, such as `ENOSPC` or `EACCES`, which carry a Node `code` the parse errors lack. A storage failure is a server error and stays a 500, so the fix recognizes parse failures specifically rather than answering every non-multer error from an upload with 400. Test: a body with no boundary, a truncated body and a malformed part header each get 400; a storage failure still gets 500.
standalone: yes
context: multer passes busboy's errors on unchanged (`make-middleware.js`, its `busboy.on('error', ...)` handler), so `convertUploadErrors` passes them through and `errorHandler` answers them with its fixed-text 500 and logs them. 0.20.x answered them with 500 too.

---

## Resolved

<!-- Move entries here when addressed, with a note of when and what fixed it -->

### Kafka publish tracking: no unit tests for `createPublishTracker`
resolved: tracker removed in PR #208 (published_at column dropped during review; tracking responsibility deferred)

### SQON `fieldName` has no allowlist against the dictionary schema
resolved: invalid, not tracked. A record's `fieldName`s can legitimately fall outside the *current* dictionary after a migration: `migrationService.ts`'s `performMigrationValidation` re-validates existing records against a new dictionary but never rewrites their stored `data`, so a field the new schema dropped stays present and queryable on old records. Rejecting an unrecognized `fieldName` at query time would break querying that legitimate historical data. Submission-time validation already rejects an unrecognized field on the way in, via Lectern's `UNRECOGNIZED_FIELD` check (`validateRecord.ts`), called from `submissionProcessor.ts` against the category's active dictionary; that's the correct and only place for this check.
