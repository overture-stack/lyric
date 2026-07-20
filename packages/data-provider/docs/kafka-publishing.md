# Kafka publishing

After a submission is committed, Lyric can push each affected record to a Kafka topic so downstream consumers (such as Maestro) can react in real time rather than polling.

## How it works

The `AppConfig.onFinishCommit` callback fires in the main thread after every successful commit. The commit result contains the full set of inserted, updated, and deleted records. `createKafkaPublisher` wraps a Kafka producer and turns that result into a batch of messages - one per record - sent in a single `producer.send` call.

Each message carries an `action` field (`insert`, `update`, or `delete`) describing what happened to the record in the submission. `isValid` always reflects the record's stored state; consumers interpret `action` to decide what to do with it.

## Message format

Each message value is a JSON string:

```json
{
  "action": "insert",
  "data": { "field": "value" },
  "entityName": "donor",
  "isValid": true,
  "organization": "EXAMPLE-ORG",
  "systemId": "ABC-12345"
}
```

## Wiring it up (library consumers)

```typescript
import { createKafkaPublisher, provider } from '@overture-stack/lyric';
import { KafkaJS } from '@confluentinc/kafka-javascript';

const kafka = new KafkaJS.Kafka({ kafkaJS: { brokers: ['kafka:9092'], clientId: 'my-service' } });
const producer = kafka.producer();
await producer.connect();

const appConfig: AppConfig = {
  // ...other config
  onFinishCommit: createKafkaPublisher({
    producer,
    topic: 'lyric-document-updates',
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
| `onError` | `(err: unknown) => void` | no | Called when `producer.send` fails after all retries; defaults to `console.error` |

## Error handling

Publish errors are caught and passed to `onError`; if no `onError` is provided they go to `console.error`. The publisher never rethrows, so a Kafka failure does not affect the commit result visible to the API caller.

The underlying producer is configured with five retries and exponential backoff (300ms to 30s) before a failure is reported.
