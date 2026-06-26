import { KafkaJS } from '@confluentinc/kafka-javascript';

import {
	connect,
	createKafkaPublisher,
	createPublishTracker,
	type KafkaPublisherConfig,
	type Logger,
	type ResultOnCommit,
} from '@overture-stack/lyric';

type LyricDb = ReturnType<typeof connect>;

type KafkaSetupResult = {
	disconnect: () => Promise<void>;
	onFinishCommit: (result: ResultOnCommit) => Promise<void>;
};

export const setupKafka = async (db: LyricDb, logger: Logger): Promise<KafkaSetupResult | undefined> => {
	const brokers = process.env.KAFKA_BROKERS;
	const clientId = process.env.KAFKA_CLIENT_ID ?? 'lyric';
	const topic = process.env.KAFKA_TOPIC;

	if (!brokers) return undefined;

	if (!topic) {
		throw new Error('KAFKA_TOPIC is required when KAFKA_BROKERS is set');
	}

	const kafka = new KafkaJS.Kafka({
		kafkaJS: {
			brokers: brokers.split(',').map((b) => b.trim()),
			clientId,
		},
	});

	const producer = kafka.producer({
		kafkaJS: {
			retry: {
				initialRetryTime: 300,
				maxRetryTime: 30_000,
				retries: 5,
			},
		},
	});

	logger.info(`[kafka] Connecting to broker(s): ${brokers}`);
	await producer.connect();
	logger.info(`[kafka] Connected (clientId: ${clientId}). Publishing commits to topic: ${topic}`);

	const admin = kafka.admin();
	await admin.connect();
	const existingTopics = await admin.listTopics();
	if (!existingTopics.includes(topic)) {
		logger.info(`[kafka] Topic '${topic}' not found, creating with default settings`);
		await admin.createTopics({ topics: [{ topic }] });
		logger.info(`[kafka] Topic '${topic}' created`);
	}
	await admin.disconnect();

	const config: KafkaPublisherConfig = {
		onError: (err) => logger.error('[kafka] Failed to publish commit result', err),
		onSuccess: createPublishTracker(db),
		producer,
		topic,
	};

	return {
		disconnect: async () => {
			logger.info('[kafka] Disconnecting producer');
			await producer.disconnect();
		},
		onFinishCommit: createKafkaPublisher(config),
	};
};
