import { expect } from 'chai';
import { describe, it } from 'mocha';

import type { SubmissionDeleteData } from '@overture-stack/lyric-data-model/models';

import { mergeDeleteRecords } from '../../../src/utils/submissionUtils.js';

describe('Submission Utils - Merge multiple Submission delete records', () => {
	it('should return an object with 2 records within the same key', () => {
		const deletes1: Record<string, SubmissionDeleteData[]> = {
			food: [
				{ data: { name: 'pizza' }, entityName: 'food', isValid: true, organization: 'kitchen', systemId: 'PZ8900' },
			],
		};
		const deletes2: Record<string, SubmissionDeleteData[]> = {
			food: [
				{
					data: { name: 'pizza' },
					entityName: 'hamburger',
					isValid: true,
					organization: 'kitchen',
					systemId: 'HG1234',
				},
			],
		};
		const response = mergeDeleteRecords(deletes1, deletes2);
		expect(Object.keys(response).length).eq(1);
		expect(Object.keys(response)[0]).eql('food');
		expect(response['food'].length).eq(2);
		expect(response['food']).eql([
			{ data: { name: 'pizza' }, entityName: 'food', isValid: true, organization: 'kitchen', systemId: 'PZ8900' },
			{
				data: { name: 'pizza' },
				entityName: 'hamburger',
				isValid: true,
				organization: 'kitchen',
				systemId: 'HG1234',
			},
		]);
	});
	it('should return an object with 2 records with different key', () => {
		const deletes1: Record<string, SubmissionDeleteData[]> = {
			food: [
				{ data: { name: 'pizza' }, entityName: 'food', isValid: true, organization: 'kitchen', systemId: 'PZ8900' },
			],
		};
		const deletes2: Record<string, SubmissionDeleteData[]> = {
			animal: [
				{
					data: { name: 'lion' },
					entityName: 'animal',
					isValid: false,
					organization: 'zoo',
					systemId: 'LN5566',
				},
			],
		};
		const response = mergeDeleteRecords(deletes1, deletes2);
		expect(Object.keys(response).length).eq(2);
		expect(Object.keys(response)).eql(['food', 'animal']);
		expect(response['food'].length).eq(1);
		expect(response['animal'].length).eq(1);
		expect(response['food'][0]).eql({
			data: { name: 'pizza' },
			entityName: 'food',
			isValid: true,
			organization: 'kitchen',
			systemId: 'PZ8900',
		});
		expect(response['animal'][0]).eql({
			data: { name: 'lion' },
			entityName: 'animal',
			isValid: false,
			organization: 'zoo',
			systemId: 'LN5566',
		});
	});
	it('should avoid duplication and return an object with 1 record', () => {
		const deletes1: Record<string, SubmissionDeleteData[]> = {
			food: [
				{ data: { name: 'Paella' }, entityName: 'food', isValid: true, organization: 'kitchen', systemId: 'PAE344' },
			],
		};
		const deletes2: Record<string, SubmissionDeleteData[]> = {
			food: [
				{ data: { name: 'Paella' }, entityName: 'food', isValid: true, organization: 'kitchen', systemId: 'PAE344' },
			],
		};
		const deletes3: Record<string, SubmissionDeleteData[]> = {
			food: [
				{ data: { name: 'Paella' }, entityName: 'food', isValid: true, organization: 'kitchen', systemId: 'PAE344' },
			],
		};
		const response = mergeDeleteRecords(deletes1, deletes2, deletes3);
		expect(Object.keys(response).length).eq(1);
		expect(Object.keys(response)).eql(['food']);
		expect(response['food'].length).eq(1);
		expect(response['food'][0]).eql({
			data: { name: 'Paella' },
			entityName: 'food',
			isValid: true,
			organization: 'kitchen',
			systemId: 'PAE344',
		});
	});
});
