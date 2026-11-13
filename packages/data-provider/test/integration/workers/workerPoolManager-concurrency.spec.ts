import { expect } from 'chai';
import { after, afterEach, before, describe, it } from 'mocha';

import { dictionarySportsData } from '../../fixtures/dictionarySchemasTestData.js';
import { assertExists } from '../assertions.js';
import { createLyricProvider, type LyricProvider } from '../dependencies/lyricProvider.js';
import { getContainers } from '../globalSetup.js';

const WORKER_COUNT = 3;

describe('Integration - Worker Pool - concurrent tasks across several workers', () => {
	let lyricProvider: LyricProvider;

	before(async () => {
		// With more than one worker allowed, concurrent tasks make the pool start workers other than
		// the first one, which is the only one initialized at startup.
		lyricProvider = await createLyricProvider({
			...getContainers().providerConfig,
			workerPool: { maxWorkers: WORKER_COUNT },
		});
	});

	afterEach(async () => {
		await getContainers().resetDatabases();
	});

	after(async () => {
		await lyricProvider.shutdown();
	});

	it('validates every submission when validations run at the same time', async () => {
		// Given: several submissions waiting in VALIDATING, one per organization
		const dictionary = await lyricProvider.repositories.dictionary.save({
			name: 'sports',
			version: '1.0.0',
			dictionary: dictionarySportsData,
		});
		const category = await lyricProvider.repositories.category.save({
			name: 'sports-category',
			activeDictionaryId: dictionary.id,
		});

		const submissionIds = await Promise.all(
			Array.from({ length: WORKER_COUNT * 2 }, (_, index) =>
				lyricProvider.repositories.submission.save({
					data: {
						inserts: {
							sport: { batchName: 'sports.tsv', records: [{ sport_id: `${index}`, name: `Sport ${index}` }] },
						},
					},
					dictionaryCategoryId: category.id,
					dictionaryId: dictionary.id,
					organization: `org-${index}`,
					status: 'VALIDATING',
					createdBy: 'test-user',
				}),
			),
		);

		// When: their validations run concurrently on the pool
		await Promise.all(
			submissionIds.map((submissionId) => lyricProvider.configs.workerPool.dataValidation({ submissionId })),
		);

		// Then: none of them is left in VALIDATING
		const statuses = await Promise.all(
			submissionIds.map(async (submissionId) => {
				const submission = await lyricProvider.repositories.submission.getSubmissionById(submissionId);
				assertExists(submission);
				return submission.status;
			}),
		);
		expect(statuses).to.deep.equal(submissionIds.map(() => 'VALID'));
	});
});
