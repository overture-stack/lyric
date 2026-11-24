# Roadmap: Kafka selective republish endpoint

`POST /submission/:id/republish`: re-sends a specific committed submission's records to Kafka without triggering a full Maestro re-index. Useful for targeted recovery when publish fails after all retries. Requires new route + controller + service method + auth consideration.
