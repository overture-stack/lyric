import { expect } from 'chai';
import { describe, it } from 'mocha';

import type { SubmissionInsertData } from '@overture-stack/lyric-data-model/models';

import { mergeInsertsRecords } from '../../../src/utils/submissionUtils.js';

describe('Submission Utils - Merge multiple Submission insert records', () => {
	it('should return a record object with one key and merged array items', () => {
		const obj1: Record<string, SubmissionInsertData> = {
			sports: { batchName: 'sports.tsv', records: [{ title: 'footbal' }] },
		};
		const obj2: Record<string, SubmissionInsertData> = {
			sports: { batchName: 'sports', records: [{ title: 'basketball' }] },
		};
		const result = mergeInsertsRecords(obj1, obj2);
		expect(Object.keys(result).length).to.eq(1);
		expect(result['sports'].records.length).eql(2);
	});

	it('should return a record object with two different keys', () => {
		const obj1: Record<string, SubmissionInsertData> = {
			food: { batchName: 'food.tsv', records: [{ title: 'apple' }] },
		};
		const obj2: Record<string, SubmissionInsertData> = {
			sports: { batchName: 'sports', records: [{ title: 'basketball' }] },
		};
		const result = mergeInsertsRecords(obj1, obj2);
		expect(Object.keys(result).length).to.eq(2);
		expect(result['sports'].records.length).eql(1);
		expect(result['food'].records.length).eql(1);
	});

	it('should return a record object with one key and merged array items without duplication', () => {
		const obj1: Record<string, SubmissionInsertData> = {
			sports: { batchName: 'sports.tsv', records: [{ title: 'snowboarding' }] },
		};
		const obj2: Record<string, SubmissionInsertData> = {
			sports: { batchName: 'sports.csv', records: [{ title: 'snowboarding' }] },
		};
		const result = mergeInsertsRecords(obj1, obj2);
		expect(Object.keys(result).length).to.eq(1);
		expect(result['sports'].records.length).to.eq(1);
		expect(result['sports'].records[0]).eql({ title: 'snowboarding' });
	});
});
