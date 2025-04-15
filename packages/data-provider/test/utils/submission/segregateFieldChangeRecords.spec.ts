import { expect } from 'chai';
import { describe, it } from 'mocha';

import type { SubmissionUpdateData } from '@overture-stack/lyric-data-model/models';

import type { SchemaChildNode } from '../../../src/utils/dictionarySchemaRelations.js';
import { segregateFieldChangeRecords } from '../../../src/utils/submissionUtils.js';

describe('Submission Utils - Segregate the updates based on whether they involve ID fields (dependent fields) or non-ID fields', () => {
	it('returns 1 record on idFieldChangeRecord when change involves an ID field', () => {
		const submissionUpdateRecord: Record<string, SubmissionUpdateData[]> = {
			person: [{ systemId: 'PER987', new: { personId: '4' }, old: { personId: '1' } }],
		};

		const dictionaryRelations: Record<string, SchemaChildNode[]> = {
			person: [
				{
					schemaName: 'employee',
					fieldName: 'personId',
					parent: {
						schemaName: 'person',
						fieldName: 'personId',
					},
				},
			],
			employee: [],
		};

		const result = segregateFieldChangeRecords(submissionUpdateRecord, dictionaryRelations);
		expect(Object.keys(result).length).eq(2);
		expect(Object.keys(result)).eql(['idFieldChangeRecord', 'nonIdFieldChangeRecord']);
		expect(Object.keys(result['idFieldChangeRecord']).length).eq(1);
		expect(Object.keys(result['nonIdFieldChangeRecord']).length).eq(0);
		expect(Object.keys(result['idFieldChangeRecord'])[0]).eql('person');
		expect(result['idFieldChangeRecord']['person'][0]).eql({
			systemId: 'PER987',
			new: { personId: '4' },
			old: { personId: '1' },
		});
	});
	it('returns 1 record on nonIdFieldChangeRecord when change does not involve an ID field', () => {
		const submissionUpdateRecord: Record<string, SubmissionUpdateData[]> = {
			person: [{ systemId: 'PER987', new: { name: 'Pedro' }, old: { name: 'Pepe' } }],
		};
		const dictionaryRelations: Record<string, SchemaChildNode[]> = {
			person: [
				{
					schemaName: 'employee',
					fieldName: 'personId',
					parent: {
						schemaName: 'person',
						fieldName: 'personId',
					},
				},
			],
			employee: [],
		};

		const result = segregateFieldChangeRecords(submissionUpdateRecord, dictionaryRelations);
		expect(Object.keys(result).length).eq(2);
		expect(Object.keys(result)).eql(['idFieldChangeRecord', 'nonIdFieldChangeRecord']);
		expect(Object.keys(result['idFieldChangeRecord']).length).eq(0);
		expect(Object.keys(result['nonIdFieldChangeRecord']).length).eq(1);
		expect(Object.keys(result['nonIdFieldChangeRecord'])[0]).eql('person');
		expect(result['nonIdFieldChangeRecord']['person'][0]).eql({
			systemId: 'PER987',
			new: { name: 'Pedro' },
			old: { name: 'Pepe' },
		});
	});
	it('returns 1 record on idFieldChangeRecord and 1 on nonIdFieldChangeRecord', () => {
		const submissionUpdateRecord: Record<string, SubmissionUpdateData[]> = {
			person: [
				{ systemId: 'PER987', new: { name: 'Pedro' }, old: { name: 'Pepe' } },
				{ systemId: 'PER432', new: { personId: '4' }, old: { personId: '1' } },
			],
		};
		const dictionaryRelations: Record<string, SchemaChildNode[]> = {
			person: [
				{
					schemaName: 'employee',
					fieldName: 'personId',
					parent: {
						schemaName: 'person',
						fieldName: 'personId',
					},
				},
			],
			employee: [],
		};

		const result = segregateFieldChangeRecords(submissionUpdateRecord, dictionaryRelations);
		expect(Object.keys(result).length).eq(2);
		expect(Object.keys(result)).eql(['idFieldChangeRecord', 'nonIdFieldChangeRecord']);
		expect(Object.keys(result['idFieldChangeRecord']).length).eq(1);
		expect(Object.keys(result['idFieldChangeRecord'])[0]).eql('person');
		expect(result['idFieldChangeRecord']['person'][0]).eql({
			systemId: 'PER432',
			new: { personId: '4' },
			old: { personId: '1' },
		});
		expect(Object.keys(result['nonIdFieldChangeRecord']).length).eq(1);
		expect(Object.keys(result['nonIdFieldChangeRecord'])[0]).eql('person');
		expect(result['nonIdFieldChangeRecord']['person'][0]).eql({
			systemId: 'PER987',
			new: { name: 'Pedro' },
			old: { name: 'Pepe' },
		});
	});
});
