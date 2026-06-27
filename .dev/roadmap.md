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

### Kafka: expose `publishedAt` via submission API
Include the `published_at` field in `GET /submission/:id` responses so clients can query publish state without direct DB access.

### Kafka: selective republish endpoint
`POST /submission/:id/republish` - re-sends a specific committed submission's records to Kafka without triggering a full Maestro re-index. Useful for targeted recovery when publish fails after all retries. Requires new route + controller + service method + auth consideration.

---

## Completed

### Kafka publisher for Maestro indexing [done 2026-06-26]
Full Kafka integration: publisher, publish tracking, server wiring, migration.

- `createKafkaPublisher` in `src/external/kafkaPublisher.ts`: document topic pattern, `onSuccess` tracking callback, separate try/catch for publish vs tracking errors
- `createPublishTracker` in `src/external/kafkaPublishTracker.ts`: writes `published_at` to `submissions` on successful send
- `onFinishCommit` signature: `Promise<void>` (coordinated with Leo at iMicroSeq)
- Migration 0013: adds `published_at timestamp` to `submissions`; bacfills epoch for existing `COMMITTED` rows
- `apps/server`: `kafka.ts` wires producer + tracker + topic auto-create; `KAFKA_BROKERS`, `KAFKA_TOPIC`, `KAFKA_CLIENT_ID` env vars; kafkajs retry config; graceful disconnect on shutdown
- 17 mocha/chai tests passing
