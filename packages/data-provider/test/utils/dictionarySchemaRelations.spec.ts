import { expect } from 'chai';
import { describe, it } from 'mocha';

import { Schema } from '@overture-stack/lectern-client';

interface SchemaDefinition extends Schema {}

import { generateHierarchy, getDictionarySchemaRelations } from '../../src/utils/dictionarySchemaRelations.js';
import { dictionarySportStats, dictionarySportStatsNodeGraph } from './fixtures/dictionarySchemasTestData.js';

describe('Dictionary Schema Relations', () => {
	describe('Determine child relations by schema in a dictionary', () => {
		it('should return the schema children nodes on a Dictionary', () => {
			const result = getDictionarySchemaRelations(dictionarySportStats.dictionary);

			expect(result).to.deep.equal(dictionarySportStatsNodeGraph);
		});
		it('should return an empty schema children for a schema with no children', () => {
			const dictionarySchemas: SchemaDefinition[] = [
				{
					name: 'sports',
					fields: [
						{ name: 'sport_id', valueType: 'integer' },
						{ name: 'name', valueType: 'string' },
					],
				},
			];

			const result = getDictionarySchemaRelations(dictionarySchemas);

			expect(result).to.eql({ sports: [] });
		});
	});

	describe('find the hierarchycal structure between schemas in the dictionary', () => {
		it('should return only one unrelated element the tree', () => {
			const schemas: SchemaDefinition[] = [
				{
					name: 'sample',
					fields: [
						{
							name: 'id',
							valueType: 'integer',
						},
					],
					restrictions: {},
				},
			];

			const response = generateHierarchy(schemas);
			expect(response.length).to.eql(1);
			expect(response).to.eql([
				{
					schemaName: 'sample',
					children: [],
				},
			]);
		});

		it('should return all element the tree unrelated', () => {
			const schemas: SchemaDefinition[] = [
				{
					name: 'food',
					fields: [
						{
							name: 'id',
							valueType: 'integer',
						},
					],
					restrictions: {},
				},
				{
					name: 'sports',
					fields: [
						{
							name: 'id',
							valueType: 'integer',
						},
					],
					restrictions: {},
				},
			];

			const response = generateHierarchy(schemas);
			expect(response.length).to.eql(2);
			expect(response).to.eql([
				{
					schemaName: 'food',
					children: [],
				},
				{
					schemaName: 'sports',
					children: [],
				},
			]);
		});

		it('should return the hierarchy tree between 4 schemas', () => {
			const response = generateHierarchy(dictionarySportStats.dictionary);
			expect(response.length).to.eq(4);
			expect(response).to.eql([
				{
					schemaName: 'sport',
					children: [
						{
							schemaName: 'team',
							parentFieldName: 'sport_id',
							childrenFieldName: 'sport_id',
							children: [
								{ schemaName: 'player', parentFieldName: 'team_id', childrenFieldName: 'team_id', children: [] },
							],
						},
						{ schemaName: 'game', parentFieldName: 'sport_id', childrenFieldName: 'sport_id', children: [] },
					],
				},
				{
					schemaName: 'team',
					children: [{ schemaName: 'player', parentFieldName: 'team_id', childrenFieldName: 'team_id', children: [] }],
				},
				{ schemaName: 'player', children: [] },
				{ schemaName: 'game', children: [] },
			]);
		});
	});
});
