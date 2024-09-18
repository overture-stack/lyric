import { expect } from 'chai';
import { describe, it } from 'mocha';

import type { Dictionary as SchemasDictionary } from '@overture-stack/lectern-client';

import { getSchemaFieldNames } from '../../src/utils/dictionaryUtils.js';
import { dictionarySportsData } from './fixtures/dictionarySchemasTestData.js';

describe('Dictionary Utils', () => {
	it('should return 1 optional field and 2 required fields', () => {
		const dictionary: SchemasDictionary = {
			name: 'test dictionary',
			version: '1.0.0',
			schemas: dictionarySportsData,
		};

		const result = getSchemaFieldNames(dictionary, 'sport');

		expect(Object.keys(result).length).to.eq(2);
		expect(Object.keys(result)).to.eql(['required', 'optional']);
		expect(result['optional'].length).to.eq(1);
		expect(result['required'].length).to.eq(2);
		expect(result['optional']).to.eql(['description']);
		expect(result['required']).to.eql(['sport_id', 'name']);
	});
	it('should return 3 optional fields', () => {
		const dictionary: SchemasDictionary = {
			name: 'test dictionary',
			version: '2.0.0',
			schemas: [
				{
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
				},
			],
		};

		const result = getSchemaFieldNames(dictionary, 'sports');

		expect(Object.keys(result).length).to.eq(2);
		expect(Object.keys(result)).to.eql(['required', 'optional']);
		expect(result['optional'].length).to.eq(3);
		expect(result['required'].length).to.eq(0);
		expect(result['optional']).to.eql(['id', 'name', 'description']);
	});
});
