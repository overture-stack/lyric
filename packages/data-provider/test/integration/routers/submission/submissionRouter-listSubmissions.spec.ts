import { expect } from 'chai';
import { after, afterEach, before, beforeEach, describe, it } from 'mocha';
import supertest from 'supertest';

import type { NewSubmission } from '@overture-stack/lyric-data-model/models';

import { dictionarySportsData } from '../../../fixtures/dictionarySchemasTestData.js';
import { createLyricProvider, type LyricProvider } from '../../dependencies/lyricProvider.js';
import { createTestApp } from '../../dependencies/testServer.js';
import { getContainers } from '../../globalSetup.js';

type SubmissionName = 'alpha' | 'bravo' | 'charlie' | 'delta';

/**
 * Submissions saved in this order, so their IDs increase from alpha to delta. Every field differs between at least two
 * of them, so a sort or filter applied to the wrong field produces a different list. `charlie` and `delta` share a
 * creation time, and `charlie` has never been updated by anyone.
 */
const submissionFixtures: Record<
	SubmissionName,
	Pick<NewSubmission, 'createdAt' | 'createdBy' | 'organization' | 'status' | 'updatedAt' | 'updatedBy'>
> = {
	alpha: {
		createdAt: new Date('2026-01-01T00:00:00Z'),
		createdBy: 'user-b',
		organization: 'org-a',
		status: 'OPEN',
		updatedAt: new Date('2026-03-01T00:00:00Z'),
		updatedBy: 'user-c',
	},
	bravo: {
		createdAt: new Date('2026-01-03T00:00:00Z'),
		createdBy: 'user-a',
		organization: 'org-b',
		status: 'COMMITTED',
		updatedAt: new Date('2026-01-04T00:00:00Z'),
		updatedBy: 'user-a',
	},
	charlie: {
		createdAt: new Date('2026-01-02T00:00:00Z'),
		createdBy: 'user-c',
		organization: 'org-c',
		status: 'VALID',
		updatedAt: new Date('2026-02-01T00:00:00Z'),
		updatedBy: null,
	},
	delta: {
		createdAt: new Date('2026-01-02T00:00:00Z'),
		createdBy: 'user-a',
		organization: 'org-a',
		status: 'CLOSED',
		updatedAt: new Date('2026-01-05T00:00:00Z'),
		updatedBy: 'user-b',
	},
};

const submissionNames: SubmissionName[] = ['alpha', 'bravo', 'charlie', 'delta'];

describe('Integration - Submission Router - GET /category/:categoryId', () => {
	let app: supertest.Agent;
	let lyricProvider: LyricProvider;
	let categoryId: number;
	let submissionIds: Record<SubmissionName, number>;

	const listSubmissionNames = async (query: string): Promise<SubmissionName[]> => {
		const response = await app.get(`/category/${categoryId}?${query}`);
		expect(response.status, JSON.stringify(response.body)).to.eq(200);
		return response.body.records.map((record: { id: number }) => {
			const name = submissionNames.find((submissionName) => submissionIds[submissionName] === record.id);
			expect(name, `unexpected submission id ${record.id}`).to.not.be.undefined;
			return name;
		});
	};

	before(async () => {
		lyricProvider = await createLyricProvider(getContainers().providerConfig);
		app = createTestApp(lyricProvider.routers.submission);
	});

	beforeEach(async () => {
		const dictionary = await lyricProvider.repositories.dictionary.save({
			name: 'sports',
			version: '1.0.0',
			dictionary: dictionarySportsData,
		});

		const category = await lyricProvider.repositories.category.save({
			name: 'sports-category',
			activeDictionaryId: dictionary.id,
		});
		categoryId = category.id;

		const otherCategory = await lyricProvider.repositories.category.save({
			name: 'other-category',
			activeDictionaryId: dictionary.id,
		});

		const saveSubmission = (name: SubmissionName): Promise<number> =>
			lyricProvider.repositories.submission.save({
				...submissionFixtures[name],
				dictionaryCategoryId: categoryId,
				dictionaryId: dictionary.id,
			});

		// Saved one at a time, in name order, so the IDs increase from alpha to delta
		submissionIds = {
			alpha: await saveSubmission('alpha'),
			bravo: await saveSubmission('bravo'),
			charlie: await saveSubmission('charlie'),
			delta: await saveSubmission('delta'),
		};

		await lyricProvider.repositories.submission.save({
			...submissionFixtures.bravo,
			createdAt: new Date('2026-12-31T00:00:00Z'),
			dictionaryCategoryId: otherCategory.id,
			dictionaryId: dictionary.id,
		});
	});

	afterEach(async () => {
		await getContainers().resetDatabases();
	});

	after(async () => {
		await lyricProvider.shutdown();
	});

	describe('sorting', () => {
		it('lists the newest Submissions first when no sort is given, newest ID first among equal creation times', async () => {
			expect(await listSubmissionNames('')).to.eql(['bravo', 'delta', 'charlie', 'alpha']);
		});

		it('gives the same order for an explicit -createdAt as for no sort', async () => {
			expect(await listSubmissionNames('sort=-createdAt')).to.eql(['bravo', 'delta', 'charlie', 'alpha']);
		});

		it('lists the oldest Submissions first for createdAt, still newest ID first among equal creation times', async () => {
			expect(await listSubmissionNames('sort=createdAt')).to.eql(['alpha', 'delta', 'charlie', 'bravo']);
		});

		it('sorts by update time', async () => {
			expect(await listSubmissionNames('sort=-updatedAt')).to.eql(['alpha', 'charlie', 'delta', 'bravo']);
		});

		it('sorts by organization', async () => {
			expect(await listSubmissionNames('sort=organization')).to.eql(['delta', 'alpha', 'bravo', 'charlie']);
		});

		it('sorts by creator', async () => {
			expect(await listSubmissionNames('sort=createdBy')).to.eql(['delta', 'bravo', 'alpha', 'charlie']);
		});

		it('sorts by last updater, with never-updated Submissions last in ascending order', async () => {
			expect(await listSubmissionNames('sort=updatedBy')).to.eql(['bravo', 'delta', 'alpha', 'charlie']);
		});

		it('sorts by last updater, with never-updated Submissions first in descending order', async () => {
			expect(await listSubmissionNames('sort=-updatedBy')).to.eql(['charlie', 'alpha', 'delta', 'bravo']);
		});

		it('sorts by status in lifecycle order, not alphabetically', async () => {
			expect(await listSubmissionNames('sort=status')).to.eql(['alpha', 'charlie', 'delta', 'bravo']);
		});

		it('sorts by ID in either direction', async () => {
			expect(await listSubmissionNames('sort=id')).to.eql(['alpha', 'bravo', 'charlie', 'delta']);
			expect(await listSubmissionNames('sort=-id')).to.eql(['delta', 'charlie', 'bravo', 'alpha']);
		});

		it('applies later sort keys only among Submissions equal on the earlier ones', async () => {
			expect(await listSubmissionNames('sort=organization,-updatedAt')).to.eql(['alpha', 'delta', 'bravo', 'charlie']);
			expect(await listSubmissionNames('sort=organization,updatedAt')).to.eql(['delta', 'alpha', 'bravo', 'charlie']);
		});

		it('returns every Submission exactly once across pages when creation times are equal', async () => {
			const pages = await Promise.all([1, 2, 3, 4].map((page) => listSubmissionNames(`page=${page}&pageSize=1`)));

			expect(pages.flat()).to.eql(['bravo', 'delta', 'charlie', 'alpha']);
		});
	});

	describe('filtering', () => {
		it('lists only the Submissions of the requested category', async () => {
			const response = await app.get(`/category/${categoryId}`);

			expect(response.body.pagination.totalRecords).to.eq(4);
		});

		it('filters by one organization', async () => {
			expect(await listSubmissionNames('organization=org-a')).to.eql(['delta', 'alpha']);
		});

		it('filters by several organizations', async () => {
			expect(await listSubmissionNames('organization=org-a&organization=org-c')).to.eql(['delta', 'charlie', 'alpha']);
		});

		it('filters by several statuses given in any case', async () => {
			expect(await listSubmissionNames('status=OPEN&status=valid')).to.eql(['charlie', 'alpha']);
		});

		it('filters by the active statuses when onlyActive is set', async () => {
			expect(await listSubmissionNames('onlyActive=true')).to.eql(['charlie', 'alpha']);
		});

		it('filters by the creator given as username, not by the last updater', async () => {
			expect(await listSubmissionNames('username=user-a')).to.eql(['bravo', 'delta']);
		});

		it('combines filters so a Submission must match all of them', async () => {
			expect(await listSubmissionNames('organization=org-a&username=user-a')).to.eql(['delta']);
		});

		it('combines filters with a sort', async () => {
			expect(await listSubmissionNames('organization=org-a&organization=org-b&sort=updatedAt')).to.eql([
				'bravo',
				'delta',
				'alpha',
			]);
		});

		it('counts only the filtered Submissions in the pagination metadata', async () => {
			const response = await app.get(`/category/${categoryId}?organization=org-a&pageSize=1`);

			expect(response.status).to.eq(200);
			expect(response.body.records.map((record: { id: number }) => record.id)).to.eql([submissionIds.delta]);
			expect(response.body.pagination).to.eql({ currentPage: 1, pageSize: 1, totalPages: 2, totalRecords: 2 });
		});
	});

	describe('invalid requests', () => {
		it('rejects a sort field that cannot be sorted by', async () => {
			const response = await app.get(`/category/${categoryId}?sort=-dictionaryId`);

			expect(response.status).to.eq(400);
		});

		it('rejects an unknown status', async () => {
			const response = await app.get(`/category/${categoryId}?status=DONE`);

			expect(response.status).to.eq(400);
		});

		it('rejects status together with onlyActive=true', async () => {
			const response = await app.get(`/category/${categoryId}?onlyActive=true&status=OPEN`);

			expect(response.status).to.eq(400);
		});
	});
});
