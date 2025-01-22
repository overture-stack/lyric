import { expect } from 'chai';
import { describe, it } from 'mocha';

import type { SubmissionDeleteData, SubmissionUpdateData } from '@overture-stack/lyric-data-model/models';

import { filterUpdatesFromDeletes } from '../../../src/utils/submissionUtils.js';

describe('Submission Utils - Remove conflicts on Submission with records to be updated', () => {
	it('should remove 1 matching record from the updates records', () => {
		const submissionUpdateData: Record<string, SubmissionUpdateData[]> = {
			cars: [
				{ systemId: 'AAA111', new: { name: 'lamborghini Huracan' }, old: { name: 'Lambo' } },
				{ systemId: 'BBB222', new: { name: 'Volkswagen Beettle' }, old: { name: 'Beettle' } },
			],
		};

		const submissionDeleteData: Record<string, SubmissionDeleteData[]> = {
			cars: [
				{
					systemId: 'AAA111',
					data: { name: 'Lambo' },
					entityName: 'cars',
					isValid: true,
					organization: 'myCollection',
				},
			],
		};
		const result = filterUpdatesFromDeletes(submissionUpdateData, submissionDeleteData);
		expect(Object.keys(result)).to.eql(['cars']);
		expect(result['cars'].length).to.eq(1);
		expect(result['cars'][0]).to.eql({
			systemId: 'BBB222',
			new: { name: 'Volkswagen Beettle' },
			old: { name: 'Beettle' },
		});
	});
	it('should not remove any record if there is no matching Id', () => {
		const submissionUpdateData: Record<string, SubmissionUpdateData[]> = {
			cars: [
				{ systemId: 'CCC333', new: { name: 'Volkswagen' }, old: { name: 'VW' } },
				{ systemId: 'DDDD444', new: { name: 'Audi' }, old: { name: 'Q5' } },
			],
		};

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

		const result = filterUpdatesFromDeletes(submissionUpdateData, submissionDeleteData);
		expect(Object.keys(result)).to.eql(['cars']);
		expect(result['cars'].length).to.eq(2);
		expect(result['cars']).to.eql([
			{ systemId: 'CCC333', new: { name: 'Volkswagen' }, old: { name: 'VW' } },
			{ systemId: 'DDDD444', new: { name: 'Audi' }, old: { name: 'Q5' } },
		]);
	});
	it('should not remove any record if there is no matching entity name', () => {
		const submissionUpdateData: Record<string, SubmissionUpdateData[]> = {
			food: [
				{ systemId: 'PTT123', new: { name: 'Potato' }, old: { name: 'Tomato' } },
				{ systemId: 'SPNCH889', new: { name: 'Spinach' }, old: { name: 'Lettuce' } },
			],
		};

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
		const result = filterUpdatesFromDeletes(submissionUpdateData, submissionDeleteData);
		expect(Object.keys(result)).to.eql(['food']);
		expect(result['food'].length).to.eq(2);
		expect(result['food']).to.eql([
			{ systemId: 'PTT123', new: { name: 'Potato' }, old: { name: 'Tomato' } },
			{ systemId: 'SPNCH889', new: { name: 'Spinach' }, old: { name: 'Lettuce' } },
		]);
	});
	it('should return empty object when passing an empty object', () => {
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
		const result = filterUpdatesFromDeletes({}, submissionDeleteData);
		expect(Object.keys(result).length).to.eq(0);
	});
});
