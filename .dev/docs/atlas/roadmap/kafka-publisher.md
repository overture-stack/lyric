# Roadmap, completed: Kafka publisher for Maestro indexing

Full Kafka integration: publisher, server wiring, message format with `action` field.

- `createKafkaPublisher` in `src/external/kafkaPublisher.ts`: batches commit records into a single `producer.send`; each message includes `action` (`insert`/`update`/`delete`) and `isValid` reflecting stored state; `KAFKA_ACTION` type exported from `types.ts`
- `onFinishCommit` signature: `Promise<void>`
- `apps/server`: `kafka.ts` wires producer + topic auto-create; `getKafkaConfig()` centralizes env reads with misconfiguration warning; `KAFKA_BROKERS`, `KAFKA_TOPIC`, `KAFKA_CLIENT_ID` env vars; kafkajs retry config; graceful disconnect on shutdown
- Mocha/chai tests in `packages/data-provider/test/unit/external/kafkaPublisher.spec.ts`
