import { expect } from 'chai';
import { describe, it } from 'mocha';

import type { RecordErrorActionConflict, RecordErrorInvalidValue } from '@overture-stack/lyric-data-model/models';

import type { SubmissionRecordWithEntityName } from '../../../../src/repository/submissionRecordsRepository.js';
import { addInvalidConsequenceErrorsToParents } from '../../../../src/utils/submissionRecordUtils.js';
import { createDeleteRecord, createInsertRecord, createUpdateRecord } from '../../../fixtures/submissionRecords.js';

// An ID field change of sport 'SPT1' (sport_id 1 -> 2) and the records staged as its consequence
const submissionData: SubmissionRecordWithEntityName[] = [
	createUpdateRecord(
		{ id: 10, entityName: 'sport', idFieldChange: true },
		{ systemId: 'SPT1', old: { sport_id: '1' }, new: { sport_id: '2' } },
	),
	createInsertRecord({ id: 12, entityName: 'sport', parentRecord: 10 }, { sport_id: '2', name: 'Soccer' }),
	createUpdateRecord(
		{ id: 13, entityName: 'team', fileId: 2, parentRecord: 10 },
		{ systemId: 'TM1', old: { sport_id: '1' }, new: { sport_id: '2' } },
	),
	createUpdateRecord(
		{ id: 20, entityName: 'team', fileId: 2 },
		{ systemId: 'TM2', old: { name: 'Lions' }, new: { name: '' } },
	),
];

const fieldError: RecordErrorInvalidValue = {
	reason: 'UNRECOGNIZED_VALUE',
	fieldName: 'name',
	fieldValue: '',
};

describe('Submission Utils - Add Invalid Consequence Errors To Parents', () => {
	it('returns the errors unchanged when no consequence record is invalid', () => {
		const errors = { updates: { team: [{ recordId: 20, errors: [fieldError] }] } };
		expect(addInvalidConsequenceErrorsToParents(errors, submissionData)).to.eql(errors);
	});

	it('adds one summary error to the parent listing every invalid consequence record', () => {
		const errors = {
			inserts: { sport: [{ recordId: 12, errors: [fieldError] }] },
			updates: { team: [{ recordId: 13, errors: [fieldError] }] },
		};

		const response = addInvalidConsequenceErrorsToParents(errors, submissionData);

		expect(response.inserts).to.eql(errors.inserts);
		expect(response.updates?.['team']).to.eql(errors.updates.team);
		expect(response.updates?.['sport']).to.eql([
			{
				recordId: 10,
				errors: [
					{
						reason: 'INVALID_CONSEQUENCE_RECORD',
						invalidRecordIds: [12, 13],
						message: "Record(s) '12, 13' staged as a consequence of this ID field change are invalid",
					},
				],
			},
		]);
	});

	it('appends the summary to errors the parent already has instead of adding a second entry', () => {
		const conflictError: RecordErrorActionConflict = {
			reason: 'CONFLICTING_ACTION',
			systemId: 'SPT1',
			conflictingActionType: 'DELETE',
			message: 'conflict',
		};
		const errors = {
			updates: {
				sport: [{ recordId: 10, errors: [conflictError] }],
				team: [{ recordId: 13, errors: [fieldError] }],
			},
		};

		const response = addInvalidConsequenceErrorsToParents(errors, submissionData);

		expect(response.updates?.['sport']).to.have.lengthOf(1);
		expect(response.updates?.['sport']?.[0]?.errors.map((error) => error.reason)).to.eql([
			'CONFLICTING_ACTION',
			'INVALID_CONSEQUENCE_RECORD',
		]);
	});

	it('adds the summary of a DELETE parent to the deletes bucket', () => {
		const deleteData = { data: {}, isValid: true, organization: 'league' };
		const deleteGroup: SubmissionRecordWithEntityName[] = [
			createDeleteRecord({ id: 30, entityName: 'sport' }, { ...deleteData, systemId: 'SPT2' }),
			createDeleteRecord(
				{ id: 31, entityName: 'team', fileId: 3, parentRecord: 30 },
				{ ...deleteData, systemId: 'TM3' },
			),
		];
		const errors = { deletes: { team: [{ recordId: 31, errors: [fieldError] }] } };

		const response = addInvalidConsequenceErrorsToParents(errors, deleteGroup);

		expect(response.updates).to.eq(undefined);
		expect(response.deletes?.['team']).to.eql(errors.deletes.team);
		expect(response.deletes?.['sport']).to.eql([
			{
				recordId: 30,
				errors: [
					{
						reason: 'INVALID_CONSEQUENCE_RECORD',
						invalidRecordIds: [31],
						message: "Record(s) '31' staged as a consequence of this delete are invalid",
					},
				],
			},
		]);
	});
});
