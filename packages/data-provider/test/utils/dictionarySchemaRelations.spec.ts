import { expect } from 'chai';
import { describe, it } from 'mocha';

import { Schema } from '@overture-stack/lectern-client';

interface SchemaDefinition extends Schema {}

import { generateHierarchy, getDictionarySchemaRelations } from '../../src/utils/dictionarySchemaRelations.js';
import {
	dictionaryClinicalSchemas,
	dictionarySportStats,
	dictionarySportStatsNodeGraph,
} from './fixtures/dictionarySchemasTestData.js';

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

	describe('find the hierarchycal descendant structure between schemas in the dictionary', () => {
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

			const response = generateHierarchy(schemas, 'desc');
			expect(response.length).to.eql(1);
			expect(response).to.eql([
				{
					schemaName: 'sample',
					children: [],
				},
			]);
		});

		it('should return 2 unrelated elements', () => {
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

			const response = generateHierarchy(schemas, 'desc');
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
			const response = generateHierarchy(dictionaryClinicalSchemas, 'desc');
			expect(response.length).to.eq(4);
			expect(response).to.eql([
				{
					schemaName: 'sample',
					children: [],
				},
				{
					schemaName: 'study',
					children: [
						{
							schemaName: 'participant',
							children: [
								{
									schemaName: 'specimen',
									children: [
										{
											schemaName: 'sample',
											children: [],
											fieldName: 'submitter_specimen_id',
											parentFieldName: 'submitter_specimen_id',
										},
									],
									fieldName: 'submitter_participant_id',
									parentFieldName: 'submitter_participant_id',
								},
							],
							fieldName: 'study_id',
							parentFieldName: 'study_id',
						},
					],
				},
				{
					schemaName: 'participant',
					children: [
						{
							schemaName: 'specimen',
							children: [
								{
									schemaName: 'sample',
									children: [],
									fieldName: 'submitter_specimen_id',
									parentFieldName: 'submitter_specimen_id',
								},
							],
							fieldName: 'submitter_participant_id',
							parentFieldName: 'submitter_participant_id',
						},
					],
				},
				{
					schemaName: 'specimen',
					children: [
						{
							schemaName: 'sample',
							children: [],
							fieldName: 'submitter_specimen_id',
							parentFieldName: 'submitter_specimen_id',
						},
					],
				},
			]);
		});
	});

	describe('find the hierarchycal ascendant structure between schemas in the dictionary', () => {
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

			const response = generateHierarchy(schemas, 'asc');
			expect(response.length).to.eql(1);
			expect(response).to.eql([
				{
					schemaName: 'sample',
					parent: undefined,
				},
			]);
		});

		it('should return 2 unrelated elements', () => {
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

			const response = generateHierarchy(schemas, 'asc');
			expect(response.length).to.eql(2);
			expect(response).to.eql([
				{
					schemaName: 'food',
					parent: undefined,
				},
				{
					schemaName: 'sports',
					parent: undefined,
				},
			]);
		});

		it('should return the hierarchy tree between 4 schemas', () => {
			const response = generateHierarchy(dictionaryClinicalSchemas, 'asc');
			expect(response.length).to.eq(4);
			expect(response).to.eql([
				{
					schemaName: 'study',
					parent: undefined,
				},
				{
					schemaName: 'participant',
					parent: {
						schemaName: 'study',
						parent: undefined,
						fieldName: 'study_id',
						parentFieldName: 'study_id',
					},
				},
				{
					schemaName: 'specimen',
					parent: {
						schemaName: 'participant',
						parent: {
							schemaName: 'study',
							parent: undefined,
							fieldName: 'study_id',
							parentFieldName: 'study_id',
						},
						fieldName: 'submitter_participant_id',
						parentFieldName: 'submitter_participant_id',
					},
				},
				{
					schemaName: 'sample',
					parent: {
						schemaName: 'specimen',
						parent: {
							schemaName: 'participant',
							parent: {
								schemaName: 'study',
								parent: undefined,
								fieldName: 'study_id',
								parentFieldName: 'study_id',
							},
							fieldName: 'submitter_participant_id',
							parentFieldName: 'submitter_participant_id',
						},
						fieldName: 'submitter_specimen_id',
						parentFieldName: 'submitter_specimen_id',
					},
				},
			]);
		});
	});
});
