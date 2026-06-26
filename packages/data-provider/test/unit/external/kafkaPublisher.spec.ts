import { expect } from 'chai';
import { describe, it } from 'mocha';

import { createKafkaPublisher } from '../../../src/external/kafkaPublisher.js';
import type { KafkaProducer } from '../../../src/external/kafkaPublisher.js';
import type { ResultOnCommit, SubmittedDataResponse } from '../../../src/utils/types.js';

// ── helpers ───────────────────────────────────────────────────────────────────

type SentBatch = { topic: string; messages: Array<{ value: string }> };

const createMockProducer = (): KafkaProducer & { sent: SentBatch[] } => {
	const sent: SentBatch[] = [];
	return {
		sent,
		send: async (params) => {
			sent.push(params);
		},
	};
};

const createFailingProducer = (error: unknown = new Error('send failed')): KafkaProducer => ({
	send: async () => {
		throw error;
	},
});

const record = (overrides: Partial<SubmittedDataResponse> = {}): SubmittedDataResponse => ({
	data: { field: 'value' },
	entityName: 'donor',
	isValid: true,
	organization: 'TEST-ORG',
	systemId: 'SYS-001',
	...overrides,
});

const commitResult = (overrides: Partial<NonNullable<ResultOnCommit['data']>> = {}): ResultOnCommit => ({
	categoryId: 1,
	organization: 'TEST-ORG',
	submissionId: 42,
	data: {
		deletes: [],
		inserts: [],
		updates: [],
		...overrides,
	},
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe('createKafkaPublisher', () => {
	describe('when resultOnCommit has no data', () => {
		it('should not call producer.send', async () => {
			const producer = createMockProducer();
			const publish = createKafkaPublisher({ producer, topic: 'lyric-docs' });

			await publish({ categoryId: 1, organization: 'TEST-ORG', submissionId: 1 });

			expect(producer.sent).to.have.length(0);
		});
	});

	describe('when all arrays are empty', () => {
		it('should not call producer.send', async () => {
			const producer = createMockProducer();
			const publish = createKafkaPublisher({ producer, topic: 'lyric-docs' });

			await publish(commitResult());

			expect(producer.sent).to.have.length(0);
		});
	});

	describe('inserts', () => {
		it('should publish one message per insert', async () => {
			const producer = createMockProducer();
			const publish = createKafkaPublisher({ producer, topic: 'lyric-docs' });

			await publish(commitResult({ inserts: [record({ systemId: 'A' }), record({ systemId: 'B' })] }));

			expect(producer.sent[0]?.messages).to.have.length(2);
		});

		it('should publish a message with expected fields', async () => {
			const producer = createMockProducer();
			const publish = createKafkaPublisher({ producer, topic: 'lyric-docs' });
			const r = record({ systemId: 'SYS-123', organization: 'ORG-A', entityName: 'donor', isValid: true });

			await publish(commitResult({ inserts: [r] }));

			const parsed = JSON.parse(producer.sent[0]!.messages[0]!.value);
			expect(parsed).to.deep.equal({
				data: r.data,
				entityName: 'donor',
				isValid: true,
				organization: 'ORG-A',
				systemId: 'SYS-123',
			});
		});

		it('should preserve isValid from the record', async () => {
			const producer = createMockProducer();
			const publish = createKafkaPublisher({ producer, topic: 'lyric-docs' });

			await publish(commitResult({ inserts: [record({ isValid: false })] }));

			const parsed = JSON.parse(producer.sent[0]!.messages[0]!.value);
			expect(parsed.isValid).to.be.false;
		});
	});

	describe('updates', () => {
		it('should publish one message per update', async () => {
			const producer = createMockProducer();
			const publish = createKafkaPublisher({ producer, topic: 'lyric-docs' });

			await publish(commitResult({ updates: [record(), record()] }));

			expect(producer.sent[0]?.messages).to.have.length(2);
		});

		it('should preserve isValid from the record', async () => {
			const producer = createMockProducer();
			const publish = createKafkaPublisher({ producer, topic: 'lyric-docs' });

			await publish(commitResult({ updates: [record({ isValid: false })] }));

			const parsed = JSON.parse(producer.sent[0]!.messages[0]!.value);
			expect(parsed.isValid).to.be.false;
		});
	});

	describe('deletes', () => {
		it('should publish one message per delete', async () => {
			const producer = createMockProducer();
			const publish = createKafkaPublisher({ producer, topic: 'lyric-docs' });

			await publish(commitResult({ deletes: [record(), record()] }));

			expect(producer.sent[0]?.messages).to.have.length(2);
		});

		it('should force isValid to false regardless of the record value', async () => {
			const producer = createMockProducer();
			const publish = createKafkaPublisher({ producer, topic: 'lyric-docs' });

			await publish(commitResult({ deletes: [record({ isValid: true })] }));

			const parsed = JSON.parse(producer.sent[0]!.messages[0]!.value);
			expect(parsed.isValid).to.be.false;
		});
	});

	describe('batching', () => {
		it('should send inserts, updates, and deletes in a single producer.send call', async () => {
			const producer = createMockProducer();
			const publish = createKafkaPublisher({ producer, topic: 'lyric-docs' });

			await publish(
				commitResult({
					deletes: [record({ systemId: 'D' })],
					inserts: [record({ systemId: 'A' })],
					updates: [record({ systemId: 'U' })],
				}),
			);

			expect(producer.sent).to.have.length(1);
			expect(producer.sent[0]!.messages).to.have.length(3);
		});

		it('should send to the configured topic', async () => {
			const producer = createMockProducer();
			const publish = createKafkaPublisher({ producer, topic: 'my-custom-topic' });

			await publish(commitResult({ inserts: [record()] }));

			expect(producer.sent[0]?.topic).to.equal('my-custom-topic');
		});
	});

	describe('onSuccess callback', () => {
		it('should be called with submissionId after a successful publish', async () => {
			const producer = createMockProducer();
			const tracked: number[] = [];
			const publish = createKafkaPublisher({
				onSuccess: async (id) => { tracked.push(id); },
				producer,
				topic: 'lyric-docs',
			});

			await publish(commitResult({ inserts: [record()] }));

			expect(tracked).to.deep.equal([42]);
		});

		it('should not be called when there are no messages to publish', async () => {
			const producer = createMockProducer();
			const tracked: number[] = [];
			const publish = createKafkaPublisher({
				onSuccess: async (id) => { tracked.push(id); },
				producer,
				topic: 'lyric-docs',
			});

			await publish(commitResult());

			expect(tracked).to.have.length(0);
		});

		it('should not be called when producer.send throws', async () => {
			const tracked: number[] = [];
			const publish = createKafkaPublisher({
				onError: () => {},
				onSuccess: async (id) => { tracked.push(id); },
				producer: createFailingProducer(),
				topic: 'lyric-docs',
			});

			await publish(commitResult({ inserts: [record()] }));

			expect(tracked).to.have.length(0);
		});

		it('should not propagate a tracking failure', async () => {
			const producer = createMockProducer();
			const publish = createKafkaPublisher({
				onSuccess: async () => { throw new Error('db down'); },
				producer,
				topic: 'lyric-docs',
			});

			await publish(commitResult({ inserts: [record()] }));

			expect(producer.sent).to.have.length(1);
		});
	});

	describe('error handling', () => {
		it('should call onError when producer.send throws', async () => {
			const sendError = new Error('broker unavailable');
			const errors: unknown[] = [];
			const publish = createKafkaPublisher({
				onError: (e) => errors.push(e),
				producer: createFailingProducer(sendError),
				topic: 'lyric-docs',
			});

			await publish(commitResult({ inserts: [record()] }));

			expect(errors).to.have.length(1);
			expect(errors[0]).to.equal(sendError);
		});

		it('should not throw when producer.send throws and no onError is provided', async () => {
			const publish = createKafkaPublisher({
				producer: createFailingProducer(),
				topic: 'lyric-docs',
			});

			await publish(commitResult({ inserts: [record()] }));
		});
	});
});
