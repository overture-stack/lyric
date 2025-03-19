import { expect } from 'chai';
import { describe, it } from 'mocha';

import type { SubmittedData } from '@overture-stack/lyric-data-model/models';

import { transformmSubmittedDataToSubmissionDeleteData } from '../../../src/utils/submittedDataUtils.js';

describe('Submitted Data Utils - transformmSubmittedDataToSubmissionDeleteData', () => {
	const todaysDate = new Date();

	describe('Transforms SubmittedData objects into a Record grouped by entityName', () => {
		it('should return an empty object when no SubmittedData is passed', () => {
			const response = transformmSubmittedDataToSubmissionDeleteData([]);
			expect(Object.keys(response).length).to.eq(0);
		});
		it('should return an object groupd by entity name', () => {
			const submittedDataList: SubmittedData[] = [
				{
					id: 1,
					data: {
						name: 'Lamborghini Revuelto',
					},
					dictionaryCategoryId: 1,
					entityName: 'cars',
					isValid: true,
					lastValidSchemaId: 1,
					organization: 'mycollection',
					originalSchemaId: 1,
					systemId: 'ABC123',
					createdAt: todaysDate,
					createdBy: 'me',
					updatedAt: null,
					updatedBy: null,
				},
				{
					id: 2,
					data: {
						name: 'Bugatti La Voiture Noire',
					},
					dictionaryCategoryId: 1,
					entityName: 'cars',
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
			const response = transformmSubmittedDataToSubmissionDeleteData(submittedDataList);
			expect(Object.keys(response)).to.eql(['cars']);
			expect(response['cars'].length).to.eq(2);
			expect(response['cars']).to.eql([
				{
					data: {
						name: 'Lamborghini Revuelto',
					},
					entityName: 'cars',
					isValid: true,
					organization: 'mycollection',
					systemId: 'ABC123',
				},
				{
					data: {
						name: 'Bugatti La Voiture Noire',
					},
					entityName: 'cars',
					isValid: true,
					organization: 'mycollection',
					systemId: 'XYZ456',
				},
			]);
		});
	});
});
