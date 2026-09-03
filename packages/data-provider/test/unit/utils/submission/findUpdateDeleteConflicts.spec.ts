import { expect } from 'chai';
import { describe, it } from 'mocha';

import type { SubmissionRecordWithEntityName } from '../../../../src/repository/submissionRecordsRepository.js';
import { findUpdateDeleteConflicts } from '../../../../src/utils/submissionUtils.js';

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
});
