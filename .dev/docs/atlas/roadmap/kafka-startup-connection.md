# Roadmap: Kafka non-fatal startup connection

Currently `producer.connect()` at startup throws if the broker is unreachable, preventing Lyric from starting. Make startup connection non-fatal: log a warning and continue. Requires a reconnection wrapper around `producer.send()` because kafkajs does not auto-reconnect after a failed initial `connect()`. Runtime publish failures are already handled gracefully (kafkajs retries + structured `onError` logging).
