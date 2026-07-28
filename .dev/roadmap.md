# Roadmap

## Active

<!-- Add active work here -->

---

## Backlog

### Kafka: non-fatal startup connection
Currently `producer.connect()` at startup throws if the broker is unreachable, preventing Lyric from starting. Make startup connection non-fatal: log a warning and continue. Requires a reconnection wrapper around `producer.send()` because kafkajs does not auto-reconnect after a failed initial `connect()`. Runtime publish failures are already handled gracefully (kafkajs retries + structured `onError` logging).

### Kafka: health endpoint visibility
Add a `kafka` field to the `/health` response: `connected | disconnected | not configured`. Kafka disconnect should affect the readiness probe (stop traffic) but NOT the liveness probe (don't restart the pod). Also consider adding a real DB ping (`SELECT 1`) to the health response alongside Kafka status.

### Kafka: TLS/SASL support
Add `KAFKA_SSL`, `KAFKA_SASL_MECHANISM`, `KAFKA_SASL_USERNAME`, `KAFKA_SASL_PASSWORD` env vars to `apps/server/src/config/kafka.ts`. Required for any authenticated cluster (prod). Current plaintext connection blocks production use.

### Kafka: message format design [pending discussion]
Current message shape (`action`, `categoryAlias`, `categoryId`, `data`, `entityName`, `isValid`, `organization`, `systemId`) was designed around Maestro's needs. Open question from PR #208: too Maestro-specific, or should it include more fields (submission date, user) for other consumers? No backward-compatibility risk either way, Lyric never published to this topic before this feature existed; this is a design-quality question, not a break-something-today one.

### Category alias: rename and transfer
Builds on assign/unassign (Completed, below). "Reassign" conflates two operations with different risk profiles:

- **Rename**: change an already-set alias on the same category. Extends the existing `PUT /category/:categoryId/alias`, relaxing "must be null" to "must not collide with another category's alias." No new route.
- **Transfer**: move an alias from category A to B (e.g. redirecting to a new category after a schema migration). An orchestration of assign+unassign across two categories in one transaction, not a variant of assign. Open questions: grace period vs. immediate reuse of A's vacated alias, an audit trail, in-flight Kafka messages published under the old mapping. Needs its own design pass; don't build until actually needed.

### Lyric-side "is this still current" alias validation [speculative]
Once transfer (above) exists, Lyric could validate an incoming (id, alias) pair and flag when the alias has since moved to a different category. Value uncertain; depends on transfer existing first.

### Extract a reusable structured audit-log helper
`categoryService.ts`'s `assignAlias`/`unassignAlias` each log inline (`logger.info` with categoryId/previous/new alias/actor), duplicated. Worth a small `auditLog(dependencies, { action, actor, resource, changes })` helper once a second or third call site needs it (e.g. dictionary registration already changes a category's active dictionary). Cross-project version logged in the OICR roadmap too: a shared audit-log shape is worth standardizing across softeng apps rather than each repo inventing its own fields.

### Kafka: selective republish endpoint
`POST /submission/:id/republish` - re-sends a specific committed submission's records to Kafka without triggering a full Maestro re-index. Useful for targeted recovery when publish fails after all retries. Requires new route + controller + service method + auth consideration.

### apps/server: file-based configuration, mirroring Arranger
`apps/server`'s config is env-var only today. Add a file layer like Arranger's search-server: defaults → env vars → optional config file, each overriding the last, before the merged result reaches `provider()`. Needs a decision on file format/location and confirmation against Arranger's actual behaviour. `packages/data-provider` keeps receiving typed config as parameters regardless; this is purely an `apps/server` change.

### Enable fixing invalid submission before it's committed
Prompted by a submitter complaint: once a submission fails validation, starting over with a brand new submission feels like the only option. An effort-estimate pass found most of the plumbing already exists, so this is narrower than a new feature:

- `OPEN`/`VALID`/`INVALID` all count as active (`submissionUtils.ts`'s `openSubmissionStatus`); `getOrCreateActiveSubmission` reattaches new data to the existing submission for the same category+organization instead of creating a new one.
- `DELETE /:submissionId/:actionType` (`deleteActiveSubmissionEntity`) already removes a single record by index, or a whole entity's batch, and retriggers validation.
- The actual gap: resubmission is additive, not replace-in-place. `mergeInsertsRecords` (`submissionUtils.ts`) concatenates new records onto an entity's existing batch, deduping only exact-identical rows, so re-uploading a corrected file leaves the old bad rows sitting alongside the fix unless the submitter explicitly deletes that batch first. This is likely what's actually driving people to abandon a submission rather than fix it in place.

Scoped fix: make `submit`/`submitFiles` replace an entity's insert batch on resubmission instead of concatenating (or add an explicit replace mode). State machine, revalidation trigger, and delete-by-index scaffolding are already in place, so this is probably a few days including tests, once someone confirms the replace-vs-append read by tracing `submit`/`submitFiles` fully.

---

## Completed

### Category alias assign/unassign [done 2026-07-21]
`PUT`/`DELETE` on `/category/:categoryId/alias`: lets a category created before the alias feature existed get one, or have it cleared. Both idempotent, both audit-logged. Rename/transfer remain deferred (Backlog, above).

- `schemas.ts`: `categoryAliasAssignRequestSchema`, `categoryAliasUnassignRequestSchema`, body type via `zod.infer`
- `categoryService.ts`: `assignAlias`/`unassignAlias`; assign rejects a different existing alias (400) or one taken elsewhere (409), no-ops on a matching retry; unassign no-ops when already unset
- `categoryController.ts`, `categoryRouter.ts`: new handlers/routes
- swagger: documented both endpoints; extracted a shared `CategorySummary` schema
- `categoryRouter.spec.ts`: coverage for both; full integration suite run and passing (98/98)

### Kafka publisher for Maestro indexing [done 2026-06-26]
Full Kafka integration: publisher, server wiring, message format with `action` field.

- `createKafkaPublisher` in `src/external/kafkaPublisher.ts`: batches commit records into a single `producer.send`; each message includes `action` (`insert`/`update`/`delete`) and `isValid` reflecting stored state; `KAFKA_ACTION` type exported from `types.ts`
- `onFinishCommit` signature: `Promise<void>` (coordinated with iMicroSeq's team)
- `apps/server`: `kafka.ts` wires producer + topic auto-create; `getKafkaConfig()` centralises env reads with misconfiguration warning; `KAFKA_BROKERS`, `KAFKA_TOPIC`, `KAFKA_CLIENT_ID` env vars; kafkajs retry config; graceful disconnect on shutdown
- Mocha/chai tests in `packages/data-provider/test/unit/external/kafkaPublisher.spec.ts`
