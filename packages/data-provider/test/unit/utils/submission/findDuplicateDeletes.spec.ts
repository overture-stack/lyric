import { expect } from 'chai';
import { describe, it } from 'mocha';

import type { SubmissionRecordWithEntityName } from '../../../../src/repository/submissionRecordsRepository.js';
import { findDuplicateDeletes } from '../../../../src/utils/submissionRecordUtils.js';

describe('Submission Utils - Find Duplicate Deletes', () => {
	it('returns no conflicts when there are no Submission records', () => {
		const response = findDuplicateDeletes([]);
		expect(response).eql({});
	});

	it('returns no conflicts when each systemId has a single DELETE', () => {
		const submissionData: SubmissionRecordWithEntityName[] = [
			{
				actionType: 'DELETE',
				entityName: 'animals',
				id: 10,
				fileId: 1,
				state: 'RECEIVED',
				errors: [],
				data: { systemId: 'TGR1425', data: { name: 'tiger' }, isValid: true, organization: 'zoo' },
			},
			{
				actionType: 'DELETE',
				entityName: 'animals',
				id: 11,
				fileId: 1,
				state: 'RECEIVED',
				errors: [],
				data: { systemId: 'BR8912', data: { name: 'bear' }, isValid: true, organization: 'zoo' },
			},
		];
		const response = findDuplicateDeletes(submissionData);
		expect(response).eql({});
	});

	it('does not report DELETEs of different entities sharing a systemId as duplicates', () => {
		const submissionData: SubmissionRecordWithEntityName[] = [
			{
				actionType: 'DELETE',
				entityName: 'animals',
				id: 10,
				fileId: 1,
				state: 'RECEIVED',
				errors: [],
				data: { systemId: 'TGR1425', data: { name: 'tiger' }, isValid: true, organization: 'zoo' },
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
		const response = findDuplicateDeletes(submissionData);
		expect(response).eql({});
	});

	it('ignores UPDATE records sharing the systemId of a DELETE', () => {
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
				fileId: 2,
				state: 'RECEIVED',
				errors: [],
				data: { systemId: 'TGR1425', data: { name: 'tiger' }, isValid: true, organization: 'zoo' },
			},
		];
		const response = findDuplicateDeletes(submissionData);
		expect(response).eql({});
	});

	it('flags every DELETE record when more than one shares a systemId in the same entity', () => {
		const submissionData: SubmissionRecordWithEntityName[] = [
			{
				actionType: 'DELETE',
				entityName: 'animals',
				id: 10,
				fileId: 1,
				state: 'RECEIVED',
				errors: [],
				data: { systemId: 'TGR1425', data: { name: 'tiger' }, isValid: true, organization: 'zoo' },
			},
			{
				actionType: 'DELETE',
				entityName: 'animals',
				id: 20,
				fileId: 2,
				state: 'RECEIVED',
				errors: [],
				data: { systemId: 'TGR1425', data: { name: 'tiger' }, isValid: true, organization: 'zoo' },
			},
			{
				actionType: 'DELETE',
				entityName: 'animals',
				id: 30,
				fileId: 2,
				state: 'RECEIVED',
				errors: [],
				data: { systemId: 'BR8912', data: { name: 'bear' }, isValid: true, organization: 'zoo' },
			},
		];
		const conflictError = {
			reason: 'CONFLICTING_ACTION',
			systemId: 'TGR1425',
			conflictingActionType: 'DELETE',
			message: "Record with systemId 'TGR1425' has more than one DELETE staged in the same Active Submission",
		};
		const response = findDuplicateDeletes(submissionData);
		expect(response).eql({
			deletes: {
				animals: [
					{ recordId: 10, errors: [conflictError] },
					{ recordId: 20, errors: [conflictError] },
				],
			},
		});
	});
});
