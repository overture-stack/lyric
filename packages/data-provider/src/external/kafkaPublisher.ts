import type { KafkaAction, ResultOnCommit, SubmittedDataResponse } from '../utils/types.js';

/** Minimal producer interface; keeps kafkajs out of the library's direct dependency graph. */
export interface KafkaProducer {
	send(params: { topic: string; messages: Array<{ value: string }> }): Promise<unknown>;
}

/** Configuration for {@link createKafkaPublisher}. */
export type KafkaPublisherConfig = {
	/** Called when `producer.send` throws after all retries. Defaults to `console.error`. */
	onError?: (err: unknown) => void;
	producer: KafkaProducer;
	/** Topic to publish to; created automatically on startup if it does not exist. */
	topic: string;
};

const toMessage = (
	record: SubmittedDataResponse,
	action: KafkaAction,
	categoryId: number,
	categoryAlias: string | undefined,
) => ({
	// JSON.stringify drops the categoryAlias key entirely when it's undefined.
	value: JSON.stringify({
		action,
		categoryAlias,
		categoryId,
		data: record.data,
		entityName: record.entityName,
		isValid: record.isValid,
		organization: record.organization,
		systemId: record.systemId,
	}),
});

/**
 * Returns an `onFinishCommit` handler that batches all records from a commit into a single
 * `producer.send` call. Each message includes an `action` field (`insert`, `update`, or `delete`)
 * describing what happened to the record in the submission, and `isValid` reflecting the record's
 * current stored state.
 */
export const createKafkaPublisher =
	({ onError, producer, topic }: KafkaPublisherConfig) =>
	async (result: ResultOnCommit): Promise<void> => {
		if (!result.data) return;

		const { deletes, inserts, updates } = result.data;
		const { categoryAlias, categoryId } = result;
		const messages = [
			...inserts.map((r) => toMessage(r, 'insert', categoryId, categoryAlias)),
			...updates.map((r) => toMessage(r, 'update', categoryId, categoryAlias)),
			...deletes.map((r) => toMessage(r, 'delete', categoryId, categoryAlias)),
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
		}
	};
