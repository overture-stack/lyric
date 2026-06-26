# Kafka publishing

After a submission is committed, Lyric can push each affected record to a Kafka topic so downstream consumers (such as Maestro) can react in real time rather than polling.

## How it works

The `AppConfig.onFinishCommit` callback fires in the main thread after every successful commit. The commit result contains the full set of inserted, updated, and deleted records. `createKafkaPublisher` wraps a Kafka producer and turns that result into a batch of messages - one per record - sent in a single `producer.send` call.

Deleted records have `isValid` forced to `false` regardless of their stored value. This signals to consumers that the document should be removed from the index.

## Message format

Each message value is a JSON string:

```json
{
  "data": { "field": "value" },
  "entityName": "donor",
  "isValid": true,
  "organization": "EXAMPLE-ORG",
  "systemId": "ABC-12345"
}
```

## Wiring it up (library consumers)

```typescript
import { createKafkaPublisher, createPublishTracker, connect, provider } from '@overture-stack/lyric';
import { KafkaJS } from '@confluentinc/kafka-javascript';

const db = connect(dbConfig);

const kafka = new KafkaJS.Kafka({ kafkaJS: { brokers: ['kafka:9092'], clientId: 'my-service' } });
const producer = kafka.producer();
await producer.connect();

const appConfig: AppConfig = {
  // ...other config
  onFinishCommit: createKafkaPublisher({
    producer,
    topic: 'lyric-document-updates',
    onSuccess: createPublishTracker(db),   // records published_at in the submissions table
    onError: (err) => console.error('Kafka publish failed', err),
  }),
};

const lyricProvider = provider(appConfig);
```

Disconnect the producer on graceful shutdown before calling `lyricProvider.shutdown()`.

## Configuration

| Env var | Required | Default | Description |
|---|---|---|---|
| `KAFKA_BROKERS` | when Kafka is enabled | - | Comma-separated list of broker addresses |
| `KAFKA_TOPIC` | when `KAFKA_BROKERS` is set | - | Topic name; created automatically if it does not exist |
| `KAFKA_CLIENT_ID` | no | `lyric` | Kafka client identifier; use a unique value per environment |

When `KAFKA_BROKERS` is not set, `onFinishCommit` is not wired and Lyric operates without Kafka publishing.

## `KafkaPublisherConfig` reference

| Field | Type | Required | Description |
|---|---|---|---|
| `producer` | `KafkaProducer` | yes | Any object with a `send` method matching the interface |
| `topic` | `string` | yes | Kafka topic to publish to |
| `onSuccess` | `(submissionId: number) => Promise<void>` | no | Called after a successful send; use `createPublishTracker(db)` to record `published_at` |
| `onError` | `(err: unknown) => void` | no | Called when `producer.send` fails after all retries; defaults to `console.error` |

## Publish tracking

`createPublishTracker(db)` writes a `published_at` timestamp to the `submissions` table after a successful send. This is the only record that a given commit reached Kafka. A `NULL` value means the submission was either committed before Kafka was enabled (existing rows are backfilled with the Unix epoch `1970-01-01` as a sentinel) or the publish failed.

Failed publishes can be recovered by triggering a full re-index via Maestro's pull-based sync endpoint.

## Error handling

Publish errors and tracking errors are caught separately. A tracking failure (e.g. transient DB outage) does not affect the Kafka publish result and vice versa. Both log to `console.error` by default; pass `onError` to route publish errors to your logger.

The underlying producer is configured with five retries and exponential backoff (300ms to 30s) before a failure is reported.
