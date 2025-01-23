import { expect } from 'chai';
import { describe, it } from 'mocha';

import type { SubmissionDeleteData, SubmissionUpdateData } from '@overture-stack/lyric-data-model/models';

import { filterDeletesFromUpdates } from '../../../src/utils/submissionUtils.js';

describe('Submission Utils - Remove conflicts on Submission with records to be delete', () => {
	it('should remove 1 matching record from the Delete records', () => {
		const submissionDeleteData: Record<string, SubmissionDeleteData[]> = {
			cars: [
				{
					systemId: 'AAA111',
					data: { name: 'Lambo' },
					entityName: 'cars',
					isValid: true,
					organization: 'myCollection',
				},
				{
					systemId: 'BBB222',
					data: { name: 'Beettle' },
					entityName: 'cars',
					isValid: true,
					organization: 'myCollection',
				},
			],
		};

		const submissionUpdateData: Record<string, SubmissionUpdateData[]> = {
			cars: [{ systemId: 'AAA111', new: { name: 'lamborghini' }, old: { name: 'Lambo' } }],
		};
		const result = filterDeletesFromUpdates(submissionDeleteData, submissionUpdateData);
		expect(Object.keys(result)).to.eql(['cars']);
		expect(result['cars'].length).to.eq(1);
		expect(result['cars'][0]).to.eql({
			systemId: 'BBB222',
			data: { name: 'Beettle' },
			entityName: 'cars',
			isValid: true,
			organization: 'myCollection',
		});
	});
	it('should not remove any record if there is no matching Id', () => {
		const submissionDeleteData: Record<string, SubmissionDeleteData[]> = {
			cars: [
				{
					systemId: 'AAA111',
					data: { name: 'Lambo' },
					entityName: 'cars',
					isValid: true,
					organization: 'myCollection',
				},
				{
					systemId: 'BBB222',
					data: { name: 'Beettle' },
					entityName: 'cars',
					isValid: true,
					organization: 'myCollection',
				},
			],
		};

		const submissionUpdateData: Record<string, SubmissionUpdateData[]> = {
			cars: [{ systemId: 'CCC333', new: { name: 'Volkswagen' }, old: { name: 'VW' } }],
		};
		const result = filterDeletesFromUpdates(submissionDeleteData, submissionUpdateData);
		expect(Object.keys(result)).to.eql(['cars']);
		expect(result['cars'].length).to.eq(2);
		expect(result['cars']).to.eql([
			{
				systemId: 'AAA111',
				data: { name: 'Lambo' },
				entityName: 'cars',
				isValid: true,
				organization: 'myCollection',
			},
			{
				systemId: 'BBB222',
				data: { name: 'Beettle' },
				entityName: 'cars',
				isValid: true,
				organization: 'myCollection',
			},
		]);
	});
	it('should not remove any record if there is no matching entity name', () => {
		const submissionDeleteData: Record<string, SubmissionDeleteData[]> = {
			cars: [
				{
					systemId: 'AAA111',
					data: { name: 'Lambo' },
					entityName: 'cars',
					isValid: true,
					organization: 'myCollection',
				},
				{
					systemId: 'BBB222',
					data: { name: 'Beettle' },
					entityName: 'cars',
					isValid: true,
					organization: 'myCollection',
				},
			],
		};

		const submissionUpdateData: Record<string, SubmissionUpdateData[]> = {
			food: [{ systemId: 'PTT123', new: { name: 'Potato' }, old: { name: 'Tomato' } }],
		};
		const result = filterDeletesFromUpdates(submissionDeleteData, submissionUpdateData);
		expect(Object.keys(result)).to.eql(['cars']);
		expect(result['cars'].length).to.eq(2);
		expect(result['cars']).to.eql([
			{
				systemId: 'AAA111',
				data: { name: 'Lambo' },
				entityName: 'cars',
				isValid: true,
				organization: 'myCollection',
			},
			{
				systemId: 'BBB222',
				data: { name: 'Beettle' },
				entityName: 'cars',
				isValid: true,
				organization: 'myCollection',
			},
		]);
	});
	it('should return empty object when passing an empty object', () => {
		const submissionUpdateData: Record<string, SubmissionUpdateData[]> = {
			cars: [{ systemId: 'CCC333', new: { name: 'Volkswagen' }, old: { name: 'VW' } }],
		};
		const result = filterDeletesFromUpdates({}, submissionUpdateData);
		expect(Object.keys(result).length).to.eq(0);
	});
});
