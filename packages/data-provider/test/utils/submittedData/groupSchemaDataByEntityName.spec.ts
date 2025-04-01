import { expect } from 'chai';
import { describe, it } from 'mocha';

import type { NewSubmittedData, SubmittedData } from '@overture-stack/lyric-data-model/models';

import { groupSchemaDataByEntityName } from '../../../src/utils/submittedDataUtils.js';

describe('Submitted Data Utils - groupSchemaDataByEntityName', () => {
	const todaysDate = new Date();

	describe('Merge new data and submitted data and group them by entity name', () => {
		it('return an object with empty values when using empty objects', () => {
			const response = groupSchemaDataByEntityName({});
			expect(Object.keys(response).length).to.eq(2);
			expect(Object.keys(response.submittedDataByEntityName).length).to.eql(0);
			expect(Object.keys(response.schemaDataByEntityName).length).to.eql(0);
		});
		it('merge 2 non empty objects', () => {
			const newData: NewSubmittedData[] = [
				{
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
				},
			];
			const submittedData: SubmittedData[] = [
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
			];

			const response = groupSchemaDataByEntityName({ inserts: newData, submittedData });
			expect(Object.keys(response).length).to.eq(2);
			expect(response.submittedDataByEntityName['cars'].length).to.eql(2);
			expect(response.schemaDataByEntityName['cars']).to.eql([
				{
					name: 'Bugatti La Voiture Noire',
				},
				{
					name: 'Lamborghini Revuelto',
				},
			]);
		});
	});
});
