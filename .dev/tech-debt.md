# Tech debt

## Open

### Migrate off `@overture-stack/sqon-builder` once `@overture-stack/sqon` leaves RC
fix: Replace `@overture-stack/sqon-builder` (`1.1.0`) with `@overture-stack/sqon`. Rewrite `convertSqonToQuery.ts`'s type guards and SQL-generation branches against the new package's schema types (`SqonLeafSchema`/`SqonGroupSchema`/`SqonNode`), adding the operators sqon-builder never had (`notIn`, `someNotIn`, `all`, `gte`, `lte`, `between`, `wildcard`) alongside the existing `in`/`gt`/`lt`. Update `parseSQON` to the named export `SqonBuilder` (`.from()`/`.toValue()`), and `schemas.ts`'s `sqonSchema` to validate against the new schema directly.
standalone: no
context: `sqon-builder` was absorbed into `@overture-stack/sqon` as a builder utility (its `docs/sqon-builder-absorption.md`), confirmed 2026-07-21. Blocked on release status: `latest` is still `1.0.0-rc.1` (no absorbed builder); only `1.0.0-rc.2` (`rc` tag) has it, no stable release yet. Check `npm view @overture-stack/sqon dist-tags` before starting; once `latest` is non-RC, pick this up rather than defer further. Also check its zod version against Lyric's own for conflicts before adding.

### Submission endpoints don't accept a categoryId alias, unlike everywhere else
standalone: yes
context: `submissionController.ts` still parses `categoryId` with raw `Number(req.params.categoryId)` on create/commit/delete. Every other categoryId-accepting router (category, audit, migration, submittedData, validator) resolves id-or-alias via `resolveCategoryId`. Found while correcting the shared `CategoryId` swagger parameter description. Fix: wire `resolveCategoryId` into `submissionController.ts` the same way.

### Tests live in `test/` not co-located with source
standalone: yes
context: Convention mismatch, two parts: team convention is to co-locate test files with source (`validation.test.ts` next to `validation.ts`), using the `.test.ts` suffix. Lyric's existing suite instead lives entirely under `packages/data-provider/test/{unit,integration}/` (49 spec files total, e.g. `test/unit/external/kafkaPublisher.spec.ts`), using `.spec.ts`. Fix: relocate each spec file into the same directory as the source file it tests, renaming `.spec.ts` to `.test.ts` to match convention. New tests should be co-located from now on; migrating the existing 49 is a standalone cleanup task, not in scope of feature work.

### Existing tests use mocha/chai/sinon, not node:test
standalone: no
context: Depends on / related to the test placement issue above. Team convention for new code is `node:test` + `assert` with BDD naming. Migrating the mocha suite is a significant effort; do as a dedicated task, not in scope of feature work.

### Some request body/query param types hand-duplicated instead of derived from their zod schema
standalone: yes
context: `schemas.ts` already uses `zod.infer<typeof schema>` in several places (`CategoryOrganizationPathParams`, `UploadSubmissionQueryParams`, others), but `CategoryPathParams`, `DictionaryRegisterBodyParams`, and `DictionaryRegisterQueryParams` are hand-written next to a schema that could derive them, risking drift. Fix: convert to `zod.infer`. Pre-existing, not touched by the alias work; its own new schemas already follow the pattern.

### No centralised env var validation
standalone: yes
context: Each config area validates its own env vars lazily (e.g. `getRequiredConfig` throws on use). There is no startup pass that validates all required vars before connections are attempted. A schema-based approach (e.g. `zod` on `process.env`) would surface all missing/malformed vars at once on startup and produce a single readable error. `KAFKA_BROKERS`, `KAFKA_TOPIC`, `KAFKA_CLIENT_ID` follow the same lazy pattern.

### Kafka: failed-publish recovery path not documented
standalone: yes
context: When `producer.send` fails after all kafkajs retries, the commit is complete but the records were never sent to the topic. No automated recovery exists. Operators can trigger a full Maestro re-index via the existing pull-based sync (`MAESTRO_REPOSITORIES_0_BASE_URL`), but there is no runbook entry for this. Document in `.dev/docs/kafka/` once that directory structure is created. The selective republish endpoint (roadmap) would also address this.

### Server logger not passed into AppConfig
standalone: yes
context: `server.ts` creates a logger with `getLogger()` and `buildAppConfig()` creates a second one internally from `LoggerConfig`. The lyric provider should use the server's logger instance rather than constructing its own. Requires either `AppConfig` to accept a `Logger` instance (not just `LoggerConfig`), or a way to inject it post-construction. Flagged in PR #208 review.

### Base image has known high vulnerability
standalone: yes
context: `FROM node:22-alpine` (Dockerfile line 9) is flagged with a high CVE by the IDE linter. Pre-existing, unrelated to Kafka work. Resolve by pinning to a patched digest or upgrading to a newer `node:22-alpine` release once available.

### Category-level admin actions have no privilege check beyond "authenticated"
standalone: no
context: `UserSession` declares `isAdmin`/org-scoped read-write lists, and `authUtils.ts` enforces them, but only the submission/submitted-data controllers call those helpers. Category actions (`dictionaryService.register()`, and now `assignAlias`/`unassignAlias`) have no privilege check beyond authentication; categories aren't organization-scoped, so the existing helpers don't apply directly. Not a regression, assign/unassign matches `register()`'s existing posture, but both are administrative, audit-logged actions worth gating. Fix: needs a scope decision (likely an `isAdmin` gate) covering all three call sites, not a patch to just the new ones.

### `auditController`'s own "No Records found" check is unreachable dead code
standalone: yes
context: `byCategoryIdAndOrganization` (`auditController.ts`) throws `NotFound('No Records found')` on zero results, but `auditService.byCategoryIdAndOrganization` already throws its own `NotFound('No data found')` first whenever the query is empty, so the controller's check can never fire. Found while testing alias resolution for this route. Fix: remove the redundant check, or confirm why both exist first. Pre-existing, unrelated to the alias work.

### Sequential numeric category id allows enumeration
standalone: yes
context: `dictionary_categories.id` is a plain auto-increment `serial`, used directly in URLs and responses, a predictable-identifier smell. The alias feature is a step away from this but doesn't remove or restrict the id. Not fixed: would mean exposing categories only by alias externally, or a non-sequential primary key, both out of scope here.

---

## Resolved

<!-- Move entries here when addressed, with a note of when and what fixed it -->

### Kafka publish tracking: no unit tests for `createPublishTracker`
resolved: tracker removed in PR #208 (published_at column dropped during review; tracking responsibility deferred)
