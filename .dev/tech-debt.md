# Tech debt

## Open

### Migrate off `@overture-stack/sqon-builder` once `@overture-stack/sqon` leaves RC
fix: Replace `@overture-stack/sqon-builder` (`1.1.0`) with `@overture-stack/sqon`. Rewrite `convertSqonToQuery.ts`'s type guards and SQL-generation branches against the new package's schema types (`SqonLeafSchema`/`SqonCombinationSchema`/`SqonNode`). Its field operators are `in`, `not-in`, `some-not-in`, `all`, `gt`, `gte`, `lt`, `lte`, `between` and `wildcard`, and its combinations `and`, `or` and `not`, each with an optional `pivot`; Lyric handles `in`, `gt` and `lt` today. Shapes to respect: `wildcard` takes a `fieldNames` list, `between` a two-value list, and `not-in` and `some-not-in` differ only on nested fields (`not-in`: at least one nested item's value is outside the list; `some-not-in`: no nested item's value is in it). Import shape changes too: `SqonBuilder` is a named export (today's `SQONBuilder` is a default export), and `SqonBuilder.from()` takes an object or a JSON string, throws a `ZodError` when the input is invalid, and returns a builder handle needing `.toValue()` to extract the plain `SqonNode`. Update `parseSQON` accordingly: it maps the SQON package's `ZodError` to `BadRequest` and rethrows every other error, so a parse failure never reaches a caller as `undefined`, which callers read as no filter. The package uses zod 4 (see context) and exports zod schemas in its public API, and a zod 4 schema can't nest inside Lyric's zod 3 schemas, so `schemas.ts`'s `sqonSchema` either moves with Lyric to zod 4, or validates the SQON as a separate step (`SqonSchema.safeParse`, or `SqonBuilder.from()` in a try), or validates against `getSqonJsonSchema()`; `parseSQON`'s `ZodError` check must match the zod major the package throws. Empty groups follow the Overture-wide rule stated in the SQON package's README and Arranger's 3.1 migration guide: an empty `and`, `or` or `not` means everything, and a root `and[]` means no filter; a compiler may reject an empty group, as Lyric does, but never reads one as nothing; removing one is allowed only directly under `and`; and an access filter containing an empty group anywhere is refused. Add Lyric's conformance cases for that rule as part of this migration.
standalone: no
context: `sqon-builder` was absorbed into `@overture-stack/sqon` as a builder utility (its `docs/sqon-builder-absorption.md`), confirmed 2026-07-21. Blocked on release status, re-checked 2026-11-03: `latest` is still `1.0.0-rc.1` (predates the absorption) and `rc` is at `1.0.0-rc.6`, no stable release yet. The package's main carries changes since rc.6, so ask its maintainers which release to target rather than assuming the newest RC. Check `npm view @overture-stack/sqon dist-tags` before starting; once `latest` is non-RC, pick this up rather than defer further. zod: through rc.5 the package needed `^3.24.2`, which Lyric's `^3.23.8` satisfies; rc.6 moved to `^4.2.0`, as a regular dependency rather than a peer. Acceptance widens in two ways, confirmed against the rc.6 source: `SqonBuilder.from()` normalizes legacy operator aliases rather than rejecting them (`=`, `==` and `===` become `in`; `!=` and `!==` become `not-in`; `>`, `>=`, `<` and `<=` become `gt`, `gte`, `lt` and `lte`; `filter` becomes `wildcard`), and every node schema keeps unknown keys, which sqon-builder accepts but strips. Confirm with the iMS Submission Service before shipping: its request validation uses `parseSQON`, and this migration widens what `parseSQON` accepts. Ship this together with the access entries that follow it.

### An empty readable-organization list matches no submitted data
fix: `filterByOrganizationArray` (`submittedRepository.ts`) compiles an empty organization list to a condition matching no records, so every caller inherits it. An absent list (`undefined`, which `getUserReadableOrganizations` returns for admins and when auth is disabled) keeps meaning every organization. Test: a non-admin user with no readable organizations sees no submitted data from both category-wide reads, `getSubmittedDataByCategory` and `getSubmittedDataByCategoryStream`, and the pagination total is zero.
standalone: no
context: ship before or with the SQON migration release.

### A session is an admin only when `isAdmin` is `true`
fix: `getUserReadableOrganizations`, `hasUserReadAccess` and `hasUserWriteAccess` (`authUtils.ts`) check `user.isAdmin === true`, since a custom auth handler can build the session from token claims that TypeScript's types don't bind. Test: a session whose `isAdmin` is any value other than `true` reads and writes only its listed organizations, in all three. Ships with a MIGRATION.md note: a `UserSession` reads and writes every organization through `isAdmin: true` only.
standalone: no
context: ship before or with the SQON migration release.

### A session without a list of readable organizations reads none
fix: `getUserReadableOrganizations` (`authUtils.ts`) returns `[]` for a session that isn't an admin and whose `allowedReadOrganizations` isn't an array, which matches no records, as the empty readable-organization list entry requires. Test: such a session sees no submitted data from both category-wide reads, and the pagination total is zero.
standalone: no
context: ship before or with the SQON migration release, and no earlier than the empty readable-organization list entry.

### Auth applies to a `HEAD` request wherever it applies to `GET`
fix: `shouldBypassAuth` (`auth.ts`) decides a `HEAD` request as it decides `GET`, so every route behind the auth middleware, and both category-wide submitted data reads, inherit it. Test: with `protectedMethods: ['GET']`, a `HEAD` request without a user is answered `401`, both through the auth middleware and through `getSubmittedDataByCategory` called from a route outside Lyric's router. Ships with a MIGRATION.md note: auth applies to a `HEAD` request wherever it applies to `GET`.
standalone: no
context: ship before or with the SQON migration release.

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
context: `schemas.ts` already uses `zod.infer<typeof schema>` in several places (`CategoryOrganizationPathParams`, `UploadSubmissionQueryParams`, others), but `CategoryPathParams`, `DictionaryRegisterBodyParams`, and `DictionaryRegisterQueryParams` are hand-written next to a schema that could derive them, risking drift.

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
context: `FROM node:22-alpine` (Dockerfile line 9) is flagged with a high CVE by the IDE linter.

### The image is built with a different pnpm than CI
fix: change the `Dockerfile`'s `corepack prepare pnpm@11.1.1 --activate` to the version vetted by the Jenkins pipeline library's shared pnpm step, 12.9.1 as of 2026-11-09, so the image and the tests use the same pnpm.
standalone: yes
context: Lyric's pipeline installs, builds and tests through the library's shared pnpm step. That step uses the version named by `packageManager` in the root `package.json`, or the library's default when none is named, as in Lyric's today. Setting `packageManager` stops the build unless the library has vetted the version it names. Both builds install from the same frozen lockfile, and pnpm 12.9.1 installs it.

### `auditController`'s own "No Records found" check is unreachable dead code
fix: remove the redundant check, or confirm why both exist first.
standalone: yes
context: `byCategoryIdAndOrganization` (`auditController.ts`) throws `NotFound('No Records found')` on zero results, but `auditService.byCategoryIdAndOrganization` already throws its own `NotFound('No data found')` first whenever the query is empty, so the controller's check can never fire.

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

### A dictionary migration's revalidation never reaches `onFinishCommit`
fix: pass each organization's `ResultOnCommit` from a migration back to the main thread and call `onFinishCommit` with it, as `workerPoolManager.ts` does after a commit, so a host reindexes records whose validity was changed by the migration.
standalone: yes
context: `performMigrationValidation` (`migrationService.ts`) passes `onFinishCommit` along, but the worker's config sets it to `undefined`, and `performCommitSubmissionAsync` never calls it. A host reindexing on commit keeps stale `isValid` values for every record revalidated by a migration. A later commit reports only records whose validity changes in that commit, so it does not correct them either.

### A migration interrupted by a restart blocks its category's commits
fix: when the server starts, mark `FAILED` any `IN_PROGRESS` migration whose run no longer holds its lock, so `?force=true` on dictionary registration can re-run it.
standalone: yes
context: the run takes the lock when it starts, such as a session-level Postgres advisory lock keyed to the migration, or a lease it renews. `submission.commitSubmission` answers `409` for a category while one of its migrations is `IN_PROGRESS`, and nothing changes that status after a restart. The lock keeps a server starting beside another from failing a migration still running there. Until then, recovery means changing the migration's row in `dictionary_migration` by hand.

### A failed validation task leaves its submission in `VALIDATING`
fix: when a data validation task fails, in the worker or in `workerPoolManager.ts`'s `dataValidation` wrapper, move the submission out of `VALIDATING` to a status from which it can be edited or validated again, and do the same at server start for any submission left `VALIDATING` by a restart. Decide the status first: `submission_status` has no error value, and `OPEN` or `INVALID` each tell the client something different, so this may need a new enum value and a migration. Test: a validation whose worker task throws leaves its submission in that status, not `VALIDATING`.
standalone: yes
context: every caller sets `VALIDATING` before firing `workerPool.dataValidation` without awaiting it, and the wrapper only logs a failure, so nothing changes the status afterwards. Seen when workers the pool started on demand were never initialized: their tasks failed and the submissions stayed `VALIDATING`. That cause is fixed (every task now initializes its worker), but any other failure, such as a lost database connection or a missing dictionary, still strands the submission, and a `VALIDATING` submission blocks further edits. Until then, recovery means changing the submission's row in `submissions` by hand.

### The npm package ships compiled test support code
fix: build `packages/data-provider` for publishing from a `tsconfig.build.json` that excludes `test/`, so `dist/test/` stays out of `@overture-stack/lyric`.
standalone: yes
context: `tsconfig.json` includes the whole package except `*.spec.ts`, and `package.json`'s `files` publishes all of `dist/`. The published package carries test fixtures, the integration setup and test container configuration, none of them used by consumers.

### Parse request bodies after authentication in every router
fix: in the audit, category, dictionary, migration, submitted data and validator routers, parse a body on each route after Lyric's auth middleware, as `submissionRouter.ts` does, in place of their router-wide `urlencoded` and `json` parsers. Then extend `routerAuthentication.spec.ts`'s check for router-wide middleware from the submission router to every router. Ship it with a MIGRATION.md section: an application's own route, registered after a Lyric router on the same path, then gets no `req.body` from Lyric and parses its own.
standalone: yes
context: a router-wide parser runs for every request under its router's path, ahead of the route's authentication, and also for a request passing through to an application's own route. Each parser holds at most its 100kb default in memory per request.
