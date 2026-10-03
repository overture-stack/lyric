import { expect } from 'chai';
import { describe, it } from 'mocha';

import type { SubmissionRecordWithEntityName } from '../../../../src/repository/submissionRecordsRepository.js';
import { findUpdateDeleteConflicts } from '../../../../src/utils/submissionRecordUtils.js';
import { createDeleteRecord, createInsertRecord, createUpdateRecord } from '../../../fixtures/submissionRecords.js';

describe('Submission Utils - Find Update/Delete Conflicts', () => {
	it('returns no conflicts when there are no Submission records', () => {
		const response = findUpdateDeleteConflicts([]);
		expect(response).eql({});
	});

	it('returns no conflicts when UPDATE and DELETE records target different systemIds', () => {
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
			{
				actionType: 'DELETE',
				entityName: 'animals',
				id: 11,
				fileId: 1,
				state: 'RECEIVED',
				errors: [],
				data: { systemId: 'BR8912', data: { name: 'bear', color: 'black' }, isValid: true, organization: 'zoo' },
			},
		];
		const response = findUpdateDeleteConflicts(submissionData);
		expect(response).eql({});
	});

	it('returns no conflicts when the matching systemId belongs to a different entity', () => {
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
			{
				actionType: 'DELETE',
				entityName: 'zookeepers',
				id: 11,
				fileId: 2,
				state: 'RECEIVED',
				errors: [],
				data: { systemId: 'TGR1425', data: { name: 'someone' }, isValid: true, organization: 'zoo' },
			},
		];
		const response = findUpdateDeleteConflicts(submissionData);
		expect(response).eql({});
	});

	it('ignores INSERT records and does not treat them as part of a conflict', () => {
		const submissionData: SubmissionRecordWithEntityName[] = [
			{
				actionType: 'INSERT',
				entityName: 'animals',
				id: 9,
				fileId: 1,
				state: 'RECEIVED',
				errors: [],
				data: { name: 'beaver', color: 'brown' },
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
		];
		const response = findUpdateDeleteConflicts(submissionData);
		expect(response).eql({});
	});

	it('flags both the UPDATE and DELETE record when they share a systemId in the same entity', () => {
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
			{
				actionType: 'DELETE',
				entityName: 'animals',
				id: 12,
				fileId: 1,
				state: 'RECEIVED',
				errors: [],
				data: { systemId: 'TGR1425', data: { name: 'tiger', color: 'yellow' }, isValid: true, organization: 'zoo' },
			},
		];
		const response = findUpdateDeleteConflicts(submissionData);
		expect(response).eql({
			updates: {
				animals: [
					{
						recordId: 10,
						errors: [
							{
								reason: 'CONFLICTING_ACTION',
								systemId: 'TGR1425',
								conflictingActionType: 'DELETE',
								message:
									"Record with systemId 'TGR1425' has both an UPDATE and a DELETE staged in the same Active Submission",
							},
						],
					},
				],
			},
			deletes: {
				animals: [
					{
						recordId: 12,
						errors: [
							{
								reason: 'CONFLICTING_ACTION',
								systemId: 'TGR1425',
								conflictingActionType: 'UPDATE',
								message:
									"Record with systemId 'TGR1425' has both an UPDATE and a DELETE staged in the same Active Submission",
							},
						],
					},
				],
			},
		});
	});

	it('flags every UPDATE and DELETE row when more than one row exists for the same systemId', () => {
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
			{
				actionType: 'UPDATE',
				entityName: 'animals',
				id: 20,
				fileId: 2,
				state: 'RECEIVED',
				errors: [],
				data: { systemId: 'TGR1425', new: { weight: '200kg' }, old: { weight: '190kg' } },
			},
			{
				actionType: 'DELETE',
				entityName: 'animals',
				id: 12,
				fileId: 1,
				state: 'RECEIVED',
				errors: [],
				data: { systemId: 'TGR1425', data: { name: 'tiger', color: 'yellow' }, isValid: true, organization: 'zoo' },
			},
		];
		const response = findUpdateDeleteConflicts(submissionData);
		expect(response.updates?.['animals']?.map((record) => record.recordId)).to.have.members([10, 20]);
		expect(response.deletes?.['animals']?.map((record) => record.recordId)).to.eql([12]);
	});

	it('only flags the entities/systemIds that actually conflict, leaving others untouched', () => {
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
			{
				actionType: 'DELETE',
				entityName: 'animals',
				id: 12,
				fileId: 1,
				state: 'RECEIVED',
				errors: [],
				data: { systemId: 'TGR1425', data: { name: 'tiger', color: 'yellow' }, isValid: true, organization: 'zoo' },
			},
			{
				actionType: 'UPDATE',
				entityName: 'animals',
				id: 11,
				fileId: 1,
				state: 'RECEIVED',
				errors: [],
				data: { systemId: 'BR8912', new: { color: 'brown' }, old: { color: 'black' } },
			},
		];
		const response = findUpdateDeleteConflicts(submissionData);
		expect(Object.keys(response.updates ?? {})).to.eql(['animals']);
		expect(response.updates?.['animals']?.map((record) => record.recordId)).to.eql([10]);
		expect(response.deletes?.['animals']?.map((record) => record.recordId)).to.eql([12]);
	});

	describe('ID field change groups', () => {
		const sportDeleteData = {
			systemId: 'SPT1',
			data: { sport_id: '1', name: 'Soccer' },
			isValid: true,
			organization: 'league',
		};

		// An ID field change of sport 'SPT1' (sport_id 1 -> 2) and the records staged as its consequence
		const idFieldChangeGroup = [
			createUpdateRecord(
				{ id: 10, entityName: 'sport', idFieldChange: true },
				{ systemId: 'SPT1', old: { sport_id: '1' }, new: { sport_id: '2' } },
			),
			createDeleteRecord({ id: 11, entityName: 'sport', parentRecord: 10 }, sportDeleteData),
			createInsertRecord({ id: 12, entityName: 'sport', parentRecord: 10 }, { sport_id: '2', name: 'Soccer' }),
			createUpdateRecord(
				{ id: 13, entityName: 'team', fileId: 2, parentRecord: 10 },
				{ systemId: 'TM1', old: { sport_id: '1' }, new: { sport_id: '2' } },
			),
		];

		it('does not report an ID field change UPDATE against the DELETE staged as its consequence', () => {
			const response = findUpdateDeleteConflicts(idFieldChangeGroup);
			expect(response).eql({});
		});

		it('reports the parent UPDATE and an independent DELETE of the same systemId, not the consequence DELETE', () => {
			const submissionData = [
				...idFieldChangeGroup,
				createDeleteRecord({ id: 20, entityName: 'sport', fileId: 3 }, sportDeleteData),
			];
			const response = findUpdateDeleteConflicts(submissionData);
			expect(response.updates?.['sport']?.map((record) => record.recordId)).to.eql([10]);
			expect(response.deletes?.['sport']?.map((record) => record.recordId)).to.eql([20]);
			expect(response.updates?.['team']).to.equal(undefined);
		});

		it('reports a cascaded foreign key UPDATE and an independent DELETE of the dependent record', () => {
			const submissionData = [
				...idFieldChangeGroup,
				createDeleteRecord(
					{ id: 21, entityName: 'team', fileId: 3 },
					{ systemId: 'TM1', data: { team_id: '7', sport_id: '1' }, isValid: true, organization: 'league' },
				),
			];
			const response = findUpdateDeleteConflicts(submissionData);
			expect(response.updates?.['team']?.map((record) => record.recordId)).to.eql([13]);
			expect(response.deletes?.['team']?.map((record) => record.recordId)).to.eql([21]);
			expect(response.updates?.['sport']).to.equal(undefined);
		});
	});
});
