# Atlas

- [roadmap: Kafka startup connection](roadmap/kafka-startup-connection.md): why Lyric should start with the broker unreachable, and the reconnection wrapper it needs.
- [roadmap: Kafka health endpoint](roadmap/kafka-health-endpoint.md): the `kafka` field in `/health`, and why it affects readiness but not liveness.
- [roadmap: Kafka TLS/SASL](roadmap/kafka-tls-sasl.md): the env vars needed by an authenticated cluster.
- [roadmap: Kafka message format](roadmap/kafka-message-format.md): the open question of whether the message shape is too specific to Maestro.
- [roadmap: category alias rename and transfer](roadmap/category-alias-rename-transfer.md): two operations with different risks, and the open questions raised by transfer.
- [roadmap: audit-log helper](roadmap/audit-log-helper.md): when a shared structured audit-log helper pays for itself.
- [roadmap: Kafka selective republish](roadmap/kafka-selective-republish.md): re-sending one submission's records for targeted recovery.
- [roadmap: apps/server file configuration](roadmap/server-file-config.md): a config-file layer after env vars, as Arranger's search server has.
- [roadmap: fixing an invalid submission in place](roadmap/fix-invalid-submission-in-place.md): what already exists, and the replace-on-resubmission gap.
- [roadmap: pluralization language selector](roadmap/pluralization-language-selector.md): replacing an on/off flag with a language setting.
- [roadmap, completed: category alias assign/unassign](roadmap/category-alias-assign-unassign.md): the alias endpoints as shipped.
- [roadmap, completed: Kafka publisher](roadmap/kafka-publisher.md): the Kafka integration as shipped.
- [SQON field names](sqon-field-names.md): why query-time SQON field names are not checked against the active dictionary.
