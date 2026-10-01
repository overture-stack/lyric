import { expect } from 'chai';
import { describe, it } from 'mocha';

import type { SubmissionRecordWithEntityName } from '../../../../src/repository/submissionRecordsRepository.js';
import { createSubmissionUpdateRecords } from '../../../../src/utils/submissionRecordUtils.js';
import { createUpdateRecord } from '../../../fixtures/submissionRecords.js';

describe('createSubmissionUpdateRecords', () => {
	it('should map update records to SubmissionUpdateRecordWithEntityName, dropping non-update records', () => {
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

		const result = createSubmissionUpdateRecords(submissionData);

		expect(result).to.eql([
			{
				recordId: 10,
				entityName: 'animals',
				data: { systemId: 'TGR1425', new: { color: 'orange' }, old: { color: 'yellow' } },
			},
		]);
	});

	it('should return an empty array when there are no update records', () => {
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
		];

		const result = createSubmissionUpdateRecords(submissionData);

		expect(result).to.eql([]);
	});

	it('should return an empty array when given no records', () => {
		expect(createSubmissionUpdateRecords([])).to.eql([]);
	});

	it('should exclude an ID field change UPDATE but keep the foreign key UPDATEs staged as its consequence', () => {
		const submissionData: SubmissionRecordWithEntityName[] = [
			createUpdateRecord(
				{ id: 10, entityName: 'sport', idFieldChange: true },
				{ systemId: 'SPT1', old: { sport_id: '1' }, new: { sport_id: '2' } },
			),
			createUpdateRecord(
				{ id: 13, entityName: 'team', fileId: 2, parentRecord: 10 },
				{ systemId: 'TM1', old: { sport_id: '1' }, new: { sport_id: '2' } },
			),
		];

		const result = createSubmissionUpdateRecords(submissionData);

		expect(result).to.eql([
			{
				recordId: 13,
				entityName: 'team',
				data: { systemId: 'TM1', old: { sport_id: '1' }, new: { sport_id: '2' } },
			},
		]);
	});
});
