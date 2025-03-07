import { expect } from 'chai';
import { describe, it } from 'mocha';

import type { Schema } from '@overture-stack/lectern-client';

import { getSchemaFieldNames } from '../../src/utils/dictionaryUtils.js';
import { dictionarySportsData } from './fixtures/dictionarySchemasTestData.js';

describe('Dictionary Utils', () => {
	it('should return optional required fields', () => {
		const sportSchema = dictionarySportsData.find((schema) => schema.name === 'sport');

		if (sportSchema) {
			const result = getSchemaFieldNames(sportSchema);
			expect(Object.keys(result).length).to.eq(2);
			expect(Object.keys(result)).to.eql(['required', 'optional']);
			expect(result['optional'].length).to.eq(1);
			expect(result['required'].length).to.eq(2);
			expect(result['optional']).to.eql(['description']);
			expect(result['required']).to.eql(['sport_id', 'name']);
		} else {
			throw new Error('Sport schema not found');
		}
	});
	it('should return only optional fields', () => {
		const sportSchema: Schema = {
			name: 'sports',
			fields: [
				{
					name: 'id',
					valueType: 'integer',
					restrictions: [
						{
							required: true,
						},
					],
				},
				{
					name: 'name',
					valueType: 'string',
					restrictions: [
						{
							required: true,
						},
					],
				},
				{
					name: 'description',
					valueType: 'string',
					restrictions: [
						{
							if: {
								conditions: [
									{
										fields: ['some-field'],
										match: {
											exists: true,
										},
									},
								],
							},
							then: [
								{
									empty: false,
								},
							],
							else: {
								empty: true,
							},
						},
					],
				},
			],
		};

		if (sportSchema) {
			const result = getSchemaFieldNames(sportSchema);

			expect(Object.keys(result).length).to.eq(2);
			expect(Object.keys(result)).to.eql(['required', 'optional']);
			expect(result['optional'].length).to.eq(3);
			expect(result['required'].length).to.eq(0);
			expect(result['optional']).to.eql(['id', 'name', 'description']);
		} else {
			throw new Error('Sport schema not found');
		}
	});
});
