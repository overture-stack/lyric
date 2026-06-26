import type { ResultOnCommit, SubmittedDataResponse } from '../utils/types.js';

/** Minimal producer interface; keeps kafkajs out of the library's direct dependency graph. */
export interface KafkaProducer {
	send(params: { topic: string; messages: Array<{ value: string }> }): Promise<unknown>;
}

/** Configuration for {@link createKafkaPublisher}. */
export type KafkaPublisherConfig = {
	/** Called when `producer.send` throws after all retries. Defaults to `console.error`. */
	onError?: (err: unknown) => void;
	/** Called after a successful send; isolated from publish errors. Use {@link createPublishTracker} to persist `published_at`. */
	onSuccess?: (submissionId: number) => Promise<void>;
	producer: KafkaProducer;
	/** Topic to publish to; created automatically on startup if it does not exist. */
	topic: string;
};

const toMessage = (record: SubmittedDataResponse, isValid?: boolean) => ({
	value: JSON.stringify({
		data: record.data,
		entityName: record.entityName,
		isValid: isValid ?? record.isValid,
		organization: record.organization,
		systemId: record.systemId,
	}),
});

/**
 * Returns an `onFinishCommit` handler that batches all records from a commit into a single
 * `producer.send` call. Deleted records have `isValid` forced to `false`.
 */
export const createKafkaPublisher =
	({ onError, onSuccess, producer, topic }: KafkaPublisherConfig) =>
	async (result: ResultOnCommit): Promise<void> => {
		if (!result.data) return;

		const { deletes, inserts, updates } = result.data;
		const messages = [
			...inserts.map((r) => toMessage(r)),
			...updates.map((r) => toMessage(r)),
			...deletes.map((r) => toMessage(r, false)),
		];

		if (messages.length === 0) return;

		try {
			await producer.send({ topic, messages });
		} catch (err: unknown) {
			if (onError) {
				onError(err);
			} else {
				console.error('[kafkaPublisher] Failed to publish commit result:', err);
			}
			return;
		}

		try {
			await onSuccess?.(result.submissionId);
		} catch (err: unknown) {
			console.error('[kafkaPublisher] Failed to record publish tracking for submission', result.submissionId, ':', err);
		}
	};
