import { expect } from 'chai';
import { describe, it } from 'mocha';

import type { SubmissionRecordWithEntityName } from '../../../../src/repository/submissionRecordsRepository.js';
import { createSubmissionInsertRecords } from '../../../../src/utils/submissionUtils.js';

describe('createSubmissionInsertRecords', () => {
	it('should map insert records to SubmissionInsertRecordWithEntityName, dropping non-insert records', () => {
		const submissionData: SubmissionRecordWithEntityName[] = [
			{
				actionType: 'INSERT',
				entityName: 'animals',
				id: 8,
				fileId: 1,
				state: 'RECEIVED',
				errors: [],
				data: { name: 'elephant', color: 'gray' },
			},
			{
				actionType: 'UPDATE',
				entityName: 'animals',
				id: 10,
				fileId: 1,
				state: 'RECEIVED',
				errors: [],
				data: { systemId: 'TGR1425', new: { color: 'orange' }, old: { color: 'yellow' } },
			},
			{
				actionType: 'DELETE',
				entityName: 'animals',
				id: 12,
				fileId: 1,
				state: 'RECEIVED',
				errors: [],
				data: { systemId: 'BR8912', data: { name: 'bear', color: 'black' }, isValid: true, organization: 'zoo' },
			},
		];

		const result = createSubmissionInsertRecords(submissionData);

		expect(result).to.eql([
			{
				recordId: 8,
				entityName: 'animals',
				data: { name: 'elephant', color: 'gray' },
			},
		]);
	});

	it('should return an empty array when there are no insert records', () => {
		const submissionData: SubmissionRecordWithEntityName[] = [
			{
				actionType: 'UPDATE',
				entityName: 'animals',
				id: 10,
				fileId: 1,
				state: 'RECEIVED',
				errors: [],
				data: { systemId: 'TGR1425', new: { color: 'orange' }, old: { color: 'yellow' } },
			},
		];

		const result = createSubmissionInsertRecords(submissionData);

		expect(result).to.eql([]);
	});

	it('should return an empty array when given no records', () => {
		expect(createSubmissionInsertRecords([])).to.eql([]);
	});
});
