# Roadmap

## Active

<!-- Add active work here -->

---

## Backlog

### Kafka: non-fatal startup connection
Lyric should start, logging a warning, when the Kafka broker is unreachable at startup. Today it fails to start. Not started. [Details](docs/atlas/roadmap/kafka-startup-connection.md)

### Kafka: health endpoint visibility
Report Kafka's state (`connected`, `disconnected` or `not configured`) in `/health`, affecting readiness but not liveness. Not started. [Details](docs/atlas/roadmap/kafka-health-endpoint.md)

### Kafka: TLS/SASL support
Support TLS and SASL for Kafka through `apps/server`'s env vars. The connection is plaintext only today. Not started. [Details](docs/atlas/roadmap/kafka-tls-sasl.md)

### Kafka: message format design [pending discussion]
Whether the Kafka message shape should carry more fields for consumers other than Maestro. Open design question. [Details](docs/atlas/roadmap/kafka-message-format.md)

### Category alias: rename and transfer
Change a category's existing alias (rename), or move an alias to another category (transfer). Deferred until needed. [Details](docs/atlas/roadmap/category-alias-rename-transfer.md)

### Lyric-side "is this still current" alias validation [speculative]
Once alias transfer exists, Lyric could validate an incoming (id, alias) pair and flag when the alias has since moved to a different category. Value uncertain. Depends on transfer existing first.

### Extract a reusable structured audit-log helper
A shared structured audit-log helper, once a second or third call site needs one. Not started. [Details](docs/atlas/roadmap/audit-log-helper.md)

### Kafka: selective republish endpoint
`POST /submission/:id/republish`, re-sending one committed submission's records to Kafka. Not started. [Details](docs/atlas/roadmap/kafka-selective-republish.md)

### apps/server: file-based configuration, mirroring Arranger
An optional config-file layer for `apps/server`, after env vars, as Arranger's search server has. Needs a decision on format and location. [Details](docs/atlas/roadmap/server-file-config.md)

### Enable fixing invalid submission before it's committed
Let a submitter fix a submission that failed validation instead of starting over, likely by replacing an entity's records on resubmission. Scoped, not started. [Details](docs/atlas/roadmap/fix-invalid-submission-in-place.md)

### PLURALIZE_SCHEMAS_ENABLED: extend beyond a boolean to a language selector
Replace the on/off setting with a language: `none`, `english` or `french`. Not started. [Details](docs/atlas/roadmap/pluralization-language-selector.md)

---

## Completed

### Category alias assign/unassign [done 2026-07-21]
`PUT` and `DELETE /category/:categoryId/alias` assign and clear a category's alias. [Details](docs/atlas/roadmap/category-alias-assign-unassign.md)

### Kafka publisher for Maestro indexing [done 2026-06-26]
Committed records are published to Kafka for Maestro's indexing. [Details](docs/atlas/roadmap/kafka-publisher.md)
