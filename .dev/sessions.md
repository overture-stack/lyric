# Sessions

## 2026-06-26

Scaffolded devctx and implemented Kafka publishing via `onFinishCommit`; `Promise<void>` signature change communicated to PCGL's architect.

- `packages/data-provider/src/config/config.ts`: `onFinishCommit` typed as `(resultOnCommit: ResultOnCommit) => Promise<void>` in `AppConfig` and `BaseDependencies`
- `packages/data-provider/src/workers/workerPoolManager.ts`: `onFinishCommit` call site updated to `await`
- `packages/data-provider/src/external/kafkaPublisher.ts`: new; `createKafkaPublisher` factory, `KafkaProducer` interface, `KafkaPublisherConfig` type; document topic pattern, single batched `producer.send`; deletes force `isValid: false`; TSDoc on all exports
- `packages/data-provider/src/external/kafkaPublishTracker.ts`: new; `createPublishTracker` writes `published_at` on successful Kafka send; TSDoc on all exports
- `packages/data-provider/src/core/provider.ts`: optional `db` param for shared pool with server
- `packages/data-provider/index.ts`: exported `createKafkaPublisher`, `createPublishTracker`, `KafkaProducer`, `KafkaPublisherConfig`, `connect`, `getLogger`, `Logger`
- `packages/data-provider/test/unit/external/kafkaPublisher.spec.ts`: 17 mocha/chai tests including `onSuccess` and `onError` cases
- `packages/data-model/src/models/submissions.ts`: added nullable `publishedAt` timestamp column
- `packages/data-model/migrations/0013_add_published_at_to_submissions.sql`: ALTER TABLE + epoch backfill for existing COMMITTED rows
- `packages/data-model/migrations/meta/`: drizzle-kit snapshot and journal entry for 0013
- `apps/server/package.json`: `@confluentinc/kafka-javascript@^1.9.1` (Kafka 4.x support, also covers 3.x; replaced kafkajs which is incompatible with Kafka 4.x)
- `apps/server/src/config/kafka.ts`: new; `setupKafka` wires producer + tracker + topic auto-create; retry config; graceful disconnect; uses `KafkaJS` namespace with `kafkaJS: {}` config wrapper per library API
- `packages/data-provider/src/external/kafkaPublisher.ts`: `KafkaProducer.send` return type `Promise<unknown>` for structural compatibility with library's `Promise<RecordMetadata[]>`
- `pnpm-workspace.yaml`: approved build scripts for `@confluentinc/kafka-javascript` (native addon via librdkafka)
- `Dockerfile`: runs `node-pre-gyp install` directly from the package dir as a controlled exception; build tools (python3, make, g++) added to prod-deps only for Alpine compilation fallback - not in final image since server stage starts from base
- `packages/data-provider/docs/kafka-publishing.md`: import example updated for `@confluentinc/kafka-javascript`
- `apps/server/src/config/app.ts`: refactored to `buildAppConfig(overrides)` + `getDbConfig()` for composable setup
- `apps/server/src/server.ts`: shared logger + DB pool created before provider; Kafka disconnect in graceful shutdown
- `overture/infra/envs/dev/stateless/helm/lyric/values.yaml`: added `KAFKA_CLIENT_ID: lyric-dev`
- `README.md`, `DEVELOPMENT.md`, `.env.schema`, `apps/server/.env.schema`: Kafka env vars documented (KAFKA_BROKERS, KAFKA_CLIENT_ID, KAFKA_TOPIC)
- `docs/02-lyric.md`: system architecture updated to describe Kafka push path; Maestro Kafka integration marked complete
- `packages/data-provider/docs/kafka-publishing.md`: new; message format, wiring pattern, config reference, publish tracking, error handling
- `.dev/roadmap.md`: Kafka publisher completed; non-fatal startup, health endpoint, TLS, API exposure, republish endpoint added to Backlog
- `.dev/tech-debt.md`: env var validation, kafkaPublishTracker tests, failed-publish recovery runbook, mocha/node:test divergence
