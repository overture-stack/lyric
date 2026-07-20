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
Current message shape (`action`, `data`, `entityName`, `isValid`, `organization`, `systemId`) was designed around Maestro's expectations. Leo raised in PR #208 whether it is too Maestro-specific and should include additional fields (submission date, user, etc.) for other consumers. Jon was tagged but the thread is unresolved. Agree on a stable, consumer-agnostic schema before the format is treated as a public contract.

### Kafka: selective republish endpoint
`POST /submission/:id/republish` - re-sends a specific committed submission's records to Kafka without triggering a full Maestro re-index. Useful for targeted recovery when publish fails after all retries. Requires new route + controller + service method + auth consideration.

---

## Completed

### Kafka publisher for Maestro indexing [done 2026-06-26]
Full Kafka integration: publisher, server wiring, message format with `action` field.

- `createKafkaPublisher` in `src/external/kafkaPublisher.ts`: batches commit records into a single `producer.send`; each message includes `action` (`insert`/`update`/`delete`) and `isValid` reflecting stored state; `KAFKA_ACTION` type exported from `types.ts`
- `onFinishCommit` signature: `Promise<void>` (coordinated with Leo at iMicroSeq)
- `apps/server`: `kafka.ts` wires producer + topic auto-create; `getKafkaConfig()` centralises env reads with misconfiguration warning; `KAFKA_BROKERS`, `KAFKA_TOPIC`, `KAFKA_CLIENT_ID` env vars; kafkajs retry config; graceful disconnect on shutdown
- Mocha/chai tests in `packages/data-provider/test/unit/external/kafkaPublisher.spec.ts`
