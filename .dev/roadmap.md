# Roadmap

## Active

### Kafka publisher for Maestro indexing [in progress]
Implement `onFinishCommit` in `AppConfig` to publish each committed record to a Kafka topic so Maestro can index them.

- Inserts and updates: publish each `SubmittedDataResponse` as-is
- Deletes: publish with `isValid` forced to `false` (signals full document removal)
- Message format: `{ "value": { "systemId": "...", "organization": "...", "entityName": "...", "data": {}, "isValid": true } }`
- Design constraint: the implementation must accept a Kafka producer/client as a dependency injected via config; no internal broker discovery or hardcoded addresses
- New code lives in `packages/data-provider/src/`; tests co-located with source using `node:test` + `assert`

---

## Backlog

<!-- Add planned features here -->

---

## Completed

<!-- Move items here when done -->
