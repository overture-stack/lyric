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

### Kafka: failed-publish recovery path not documented
standalone: yes
context: When `producer.send` fails after all kafkajs retries, the commit is complete but the records were never sent to the topic. No automated recovery exists. Operators can trigger a full Maestro re-index via the existing pull-based sync (`MAESTRO_REPOSITORIES_0_BASE_URL`), but there is no runbook entry for this. Document in `.dev/docs/kafka/` once that directory structure is created. The selective republish endpoint (roadmap) would also address this.

### Server logger not passed into AppConfig
standalone: yes
context: `server.ts` creates a logger with `getLogger()` and `buildAppConfig()` creates a second one internally from `LoggerConfig`. The lyric provider should use the server's logger instance rather than constructing its own. Requires either `AppConfig` to accept a `Logger` instance (not just `LoggerConfig`), or a way to inject it post-construction. Flagged by Jon in PR #208.

### Base image has known high vulnerability
standalone: yes
context: `FROM node:22-alpine` (Dockerfile line 9) is flagged with a high CVE by the IDE linter. Pre-existing, unrelated to Kafka work. Resolve by pinning to a patched digest or upgrading to a newer `node:22-alpine` release once available.

---

## Resolved

<!-- Move entries here when addressed, with a note of when and what fixed it -->

### Kafka publish tracking: no unit tests for `createPublishTracker`
resolved: tracker removed in PR #208 (published_at column dropped on Jon's review; tracking responsibility deferred)
