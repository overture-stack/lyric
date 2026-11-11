# Roadmap: Kafka TLS/SASL support

Add `KAFKA_SSL`, `KAFKA_SASL_MECHANISM`, `KAFKA_SASL_USERNAME`, `KAFKA_SASL_PASSWORD` env vars to `apps/server/src/config/kafka.ts`. Required for any authenticated cluster (prod). Current plaintext connection blocks production use.
