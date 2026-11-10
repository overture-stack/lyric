# Roadmap: Kafka health endpoint visibility

Add a `kafka` field to the `/health` response: `connected | disconnected | not configured`. Kafka disconnect should affect the readiness probe (stop traffic) but NOT the liveness probe (don't restart the pod). Also consider adding a real DB ping (`SELECT 1`) to the health response alongside Kafka status.
