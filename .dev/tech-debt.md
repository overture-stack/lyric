# Tech debt

## Open

### Tests live in `test/` not co-located with source
standalone: yes
context: Convention mismatch: team convention is to co-locate test files with source (`validation.test.ts` next to `validation.ts`). Lyric's existing mocha suite lives in `packages/data-provider/test/`. New tests should be co-located. Migrating existing tests is a standalone cleanup task.

### Existing tests use mocha/chai/sinon, not node:test
standalone: no
context: Depends on / related to the test placement issue above. Team convention for new code is `node:test` + `assert` with BDD naming. Migrating the mocha suite is a significant effort; do as a dedicated task, not in scope of feature work.

### No centralised env var validation
standalone: yes
context: Each config area validates its own env vars lazily (e.g. `getRequiredConfig` throws on use). There is no startup pass that validates all required vars before connections are attempted. A schema-based approach (e.g. `zod` on `process.env`) would surface all missing/malformed vars at once on startup and produce a single readable error. `KAFKA_BROKERS`, `KAFKA_TOPIC`, `KAFKA_CLIENT_ID` follow the same lazy pattern.

### Kafka publish tracking: no unit tests for `createPublishTracker`
standalone: no
context: `packages/data-provider/src/external/kafkaPublishTracker.ts` has no tests. The function is a single drizzle `update` call - a unit test would require mocking the drizzle query builder chain, which is awkward. An integration test against a real DB (testcontainers pattern already used in the project) would be more valuable and honest.

### Kafka: failed-publish recovery path not documented
standalone: yes
context: When `producer.send` fails after all kafkajs retries, the submission is `COMMITTED` with `published_at = NULL`. No automated recovery exists. Operators can trigger a full Maestro re-index via the existing pull-based sync (`MAESTRO_REPOSITORIES_0_BASE_URL`), but there is no runbook entry for this. Document in `.dev/docs/kafka/` once that directory structure is created. The selective republish endpoint (roadmap) would also address this.

### Base image has known high vulnerability
standalone: yes
context: `FROM node:22-alpine` (Dockerfile line 9) is flagged with a high CVE by the IDE linter. Pre-existing, unrelated to Kafka work. Resolve by pinning to a patched digest or upgrading to a newer `node:22-alpine` release once available.

---

## Resolved

<!-- Move entries here when addressed, with a note of when and what fixed it -->
