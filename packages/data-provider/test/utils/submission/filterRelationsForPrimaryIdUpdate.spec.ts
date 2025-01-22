import { expect } from 'chai';
import { describe, it } from 'mocha';

import type { SubmissionUpdateData } from '@overture-stack/lyric-data-model/models';

import type { SchemaChildNode } from '../../../src/utils/dictionarySchemaRelations.js';
import { filterRelationsForPrimaryIdUpdate } from '../../../src/utils/submissionUtils.js';

describe('Submission Utils - Finds the filter to search for Child Dependencies', () => {
	it('should return a shema relation when record is changing its primary ID field', () => {
		const schemaRelations: SchemaChildNode[] = [
			{
				schemaName: 'employee',
				fieldName: 'personId',
				parent: {
					schemaName: 'person',
					fieldName: 'personId',
				},
			},
		];
		const updateRecord: SubmissionUpdateData = {
			systemId: 'SSS001',
			new: { personId: 'PPPPP001' },
			old: { personId: 'RRRRR001' },
		};
		const result = filterRelationsForPrimaryIdUpdate(schemaRelations, updateRecord);
		expect(result.length).to.eq(1);
		expect(result[0]).to.eql({
			dataField: 'personId',
			dataValue: 'RRRRR001',
			entityName: 'employee',
		});
	});
	it('should return empty filter when record is not changing a primary ID field', () => {
		const schemaRelations: SchemaChildNode[] = [
			{
				schemaName: 'employee',
				fieldName: 'personId',
				parent: {
					schemaName: 'person',
					fieldName: 'personId',
				},
			},
		];
		const updateRecord: SubmissionUpdateData = {
			systemId: 'SSS001',
			new: { name: 'Pedro' },
			old: { name: 'Pedro Pedro Pedro' },
		};
		const result = filterRelationsForPrimaryIdUpdate(schemaRelations, updateRecord);
		expect(result.length).to.eq(0);
	});
});
