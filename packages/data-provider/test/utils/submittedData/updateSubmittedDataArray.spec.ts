import { expect } from 'chai';
import { describe, it } from 'mocha';

import type { SubmissionUpdateData, SubmittedData } from '@overture-stack/lyric-data-model/models';

import { updateSubmittedDataArray } from '../../../src/utils/submittedDataUtils.js';

describe('Submitted Data Utils - updateSubmittedDataArray', () => {
	const todaysDate = new Date();

	const submittedDataList: SubmittedData[] = [
		{
			id: 1,
			data: { name: 'John', age: 30 },
			dictionaryCategoryId: 1,
			entityName: 'employee',
			isValid: true,
			lastValidSchemaId: 1,
			organization: 'mycompany',
			originalSchemaId: 1,
			systemId: 'ABC123',
			createdAt: todaysDate,
			createdBy: 'me',
			updatedAt: null,
			updatedBy: null,
		},
		{
			id: 2,
			data: { name: 'Jane', age: 25 },
			dictionaryCategoryId: 1,
			entityName: 'employee',
			isValid: true,
			lastValidSchemaId: 1,
			organization: 'mycollection',
			originalSchemaId: 1,
			systemId: 'XYZ456',
			createdAt: todaysDate,
			createdBy: 'me',
			updatedAt: null,
			updatedBy: null,
		},
	];

	it('should update the data when matching systemId is found', () => {
		const editData: SubmissionUpdateData[] = [
			{ systemId: 'ABC123', old: { name: 'John', age: 30 }, new: { name: 'John', age: 31 } },
		];

		const result = updateSubmittedDataArray(submittedDataList, editData);

		// Assert that the data for systemId '1' was updated, but systemId '2' remains the same
		expect(result).to.deep.equal([
			{
				id: 1,
				data: { name: 'John', age: 31 },
				dictionaryCategoryId: 1,
				entityName: 'employee',
				isValid: true,
				lastValidSchemaId: 1,
				organization: 'mycompany',
				originalSchemaId: 1,
				systemId: 'ABC123',
				createdAt: todaysDate,
				createdBy: 'me',
				updatedAt: null,
				updatedBy: null,
			},
			{
				id: 2,
				data: { name: 'Jane', age: 25 },
				dictionaryCategoryId: 1,
				entityName: 'employee',
				isValid: true,
				lastValidSchemaId: 1,
				organization: 'mycollection',
				originalSchemaId: 1,
				systemId: 'XYZ456',
				createdAt: todaysDate,
				createdBy: 'me',
				updatedAt: null,
				updatedBy: null,
			},
		]);
	});

	it('should not modify the data if no matching systemId is found', () => {
		const editData: SubmissionUpdateData[] = [
			{ systemId: 'CBA3', old: { name: 'John', age: 30 }, new: { name: 'John', age: 31 } },
		];

		const result = updateSubmittedDataArray(submittedDataList, editData);

		// Assert that no data is modified since no systemId matches
		expect(result).to.deep.equal(submittedDataList);
	});

	it('should apply updates to multiple matching systemIds', () => {
		const editData: SubmissionUpdateData[] = [
			{ systemId: 'ABC123', old: { name: 'John', age: 30 }, new: { name: 'John', age: 31 } },
			{ systemId: 'XYZ456', old: { name: 'Jane', age: 25 }, new: { name: 'Jane', age: 26 } },
		];

		const result = updateSubmittedDataArray(submittedDataList, editData);

		// Assert that both systemIds have updated data
		expect(result).to.deep.equal([
			{
				id: 1,
				data: { name: 'John', age: 31 },
				dictionaryCategoryId: 1,
				entityName: 'employee',
				isValid: true,
				lastValidSchemaId: 1,
				organization: 'mycompany',
				originalSchemaId: 1,
				systemId: 'ABC123',
				createdAt: todaysDate,
				createdBy: 'me',
				updatedAt: null,
				updatedBy: null,
			},
			{
				id: 2,
				data: { name: 'Jane', age: 26 },
				dictionaryCategoryId: 1,
				entityName: 'employee',
				isValid: true,
				lastValidSchemaId: 1,
				organization: 'mycollection',
				originalSchemaId: 1,
				systemId: 'XYZ456',
				createdAt: todaysDate,
				createdBy: 'me',
				updatedAt: null,
				updatedBy: null,
			},
		]);
	});

	it('should handle empty submittedData array', () => {
		const emptySubmittedDataList: SubmittedData[] = [];
		const editData: SubmissionUpdateData[] = [
			{ systemId: '1', old: { name: 'John', age: 30 }, new: { name: 'John', age: 31 } },
		];

		const result = updateSubmittedDataArray(emptySubmittedDataList, editData);

		// Assert that the result is still an empty array
		expect(result).to.deep.equal([]);
	});

	it('should handle empty editData array', () => {
		const emptyEditData: SubmissionUpdateData[] = [];

		const result = updateSubmittedDataArray(submittedDataList, emptyEditData);

		// Assert that the submittedData remains unchanged
		expect(result).to.deep.equal(submittedDataList);
	});

	it('should remove undefined values', () => {
		const emptyEditData: SubmissionUpdateData[] = [
			{ systemId: 'ABC123', old: { name: 'John', age: 30 }, new: { name: 'John', age: undefined } },
		];

		const result = updateSubmittedDataArray(submittedDataList, emptyEditData);

		// Assert that the submittedData remains unchanged
		expect(result).to.deep.equal([
			{
				id: 1,
				data: { name: 'John' },
				dictionaryCategoryId: 1,
				entityName: 'employee',
				isValid: true,
				lastValidSchemaId: 1,
				organization: 'mycompany',
				originalSchemaId: 1,
				systemId: 'ABC123',
				createdAt: todaysDate,
				createdBy: 'me',
				updatedAt: null,
				updatedBy: null,
			},
			{
				id: 2,
				data: { name: 'Jane', age: 26 },
				dictionaryCategoryId: 1,
				entityName: 'employee',
				isValid: true,
				lastValidSchemaId: 1,
				organization: 'mycollection',
				originalSchemaId: 1,
				systemId: 'XYZ456',
				createdAt: todaysDate,
				createdBy: 'me',
				updatedAt: null,
				updatedBy: null,
			},
		]);
	});
});
