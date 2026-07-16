import { KafkaJS } from '@confluentinc/kafka-javascript';

import {
	createKafkaPublisher,
	type KafkaPublisherConfig,
	type Logger,
	type ResultOnCommit,
} from '@overture-stack/lyric';

import { getRequiredConfig } from './envUtils.js';

export type KafkaConfig = {
	brokers: string;
	clientId: string;
	topic: string;
};

type KafkaSetupResult = {
	disconnect: () => Promise<void>;
	onFinishCommit: (result: ResultOnCommit) => Promise<void>;
};

/** Reads Kafka connection config from environment. Returns `undefined` if `KAFKA_BROKERS` is not set. */
export const getKafkaConfig = (): KafkaConfig | undefined => {
	const brokers = process.env.KAFKA_BROKERS;
	if (!brokers) {
		return undefined;
	}

	return {
		brokers,
		clientId: process.env.KAFKA_CLIENT_ID ?? 'lyric',
		topic: getRequiredConfig('KAFKA_TOPIC'),
	};
};

export const setupKafka = async (logger: Logger, config: KafkaConfig): Promise<KafkaSetupResult> => {
	const { brokers, clientId, topic } = config;

	const kafka = new KafkaJS.Kafka({
		kafkaJS: {
			brokers: brokers.split(',').map((b) => b.trim()),
			clientId,
			retry: {
				initialRetryTime: 300,
				maxRetryTime: 30_000,
				retries: 5,
			},
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
	try {
		await producer.connect();
	} catch (err) {
		logger.error('[kafka] Failed to connect to broker(s) after retries, shutting down', err);
		throw err;
	}
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

	const publisherConfig: KafkaPublisherConfig = {
		onError: (err) => logger.error('[kafka] Failed to publish commit result', err),
		producer,
		topic,
	};

	return {
		disconnect: async () => {
			logger.info('[kafka] Disconnecting producer');
			await producer.disconnect();
		},
		onFinishCommit: createKafkaPublisher(publisherConfig),
	};
};
