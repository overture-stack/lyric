import { expect } from 'chai';
import { describe, it } from 'mocha';

import type { Schema } from '@overture-stack/lectern-client';

import { getSchemaByName, getSchemaFieldNames, type SchemasDictionary } from '../../src/utils/dictionaryUtils.js';
import { dictionarySportsData } from './fixtures/dictionarySchemasTestData.js';

describe('Dictionary Utils', () => {
	describe('getSchemaFieldNames', () => {
		it('should return optional required fields from schema', () => {
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
		it('should return only optional fields from schema', () => {
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

	describe('getSchemaByName', () => {
		const dictionary: SchemasDictionary = {
			name: 'test dictionary',
			version: '1.0.0',
			schemas: [
				{
					name: 'sport',
					fields: [
						{
							name: 'sport_id',
							valueType: 'string',
							description: 'Unique identifier of the sport.',
							restrictions: {
								required: true,
							},
						},
						{
							name: 'name',
							valueType: 'string',
							description: 'Name of the sport.',
							restrictions: {
								required: true,
							},
						},
						{
							name: 'description',
							valueType: 'string',
							description: 'Description of the sport.',
							restrictions: {
								required: false,
							},
						},
					],
					description: 'The collection of data elements required to register a sport.',
					restrictions: {},
				},
				{
					name: 'player',
					fields: [
						{
							name: 'player_id',
							valueType: 'string',
							description: 'Unique identifier of the player.',
							restrictions: {
								required: true,
							},
						},
						{
							name: 'name',
							valueType: 'string',
							description: 'Name of the player.',
							restrictions: {
								required: true,
							},
						},
						{
							name: 'sport_id',
							valueType: 'string',
							description: 'Sport the player plays',
							restrictions: {
								required: true,
							},
						},
					],
					description: 'The collection of data elements required to register a sport.',
					restrictions: {
						foreignKey: [
							{
								schema: 'sport',
								mappings: [
									{
										local: 'sport_id',
										foreign: 'sport_id',
									},
								],
							},
						],
					},
				},
			],
		};
		it('should return the schema by its name', () => {
			const schemaFound = getSchemaByName('sport', dictionary);
			expect(schemaFound).eql({
				name: 'sport',
				fields: [
					{
						name: 'sport_id',
						valueType: 'string',
						description: 'Unique identifier of the sport.',
						restrictions: {
							required: true,
						},
					},
					{
						name: 'name',
						valueType: 'string',
						description: 'Name of the sport.',
						restrictions: {
							required: true,
						},
					},
					{
						name: 'description',
						valueType: 'string',
						description: 'Description of the sport.',
						restrictions: {
							required: false,
						},
					},
				],
				description: 'The collection of data elements required to register a sport.',
				restrictions: {},
			});
		});
		it('should return undefined if schema is not found', () => {
			const schemaFound = getSchemaByName('samples', dictionary);
			expect(schemaFound).eql(undefined);
		});
	});
});
