import { expect } from 'chai';
import { describe, it } from 'mocha';

import type { SubmissionRecordWithEntityName } from '../../../../src/repository/submissionRecordsRepository.js';
import { findDuplicateUpdates } from '../../../../src/utils/submissionRecordUtils.js';

describe('Submission Utils - Find Duplicate Updates', () => {
	it('returns no conflicts when there are no Submission records', () => {
		const response = findDuplicateUpdates([]);
		expect(response).eql({});
	});

	it('returns no conflicts when each systemId has a single UPDATE', () => {
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
				id: 11,
				fileId: 1,
				state: 'RECEIVED',
				errors: [],
				data: { systemId: 'BR8912', new: { color: 'brown' }, old: { color: 'black' } },
			},
		];
		const response = findDuplicateUpdates(submissionData);
		expect(response).eql({});
	});

	it('does not report UPDATEs of different entities sharing a systemId as duplicates', () => {
		// A systemId belongs to one entity, so one of these UPDATEs is invalid. It is rejected by the edit request's
		// systemId lookup, which reports a systemId of another entity as not found, not as a duplicate update.
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
				entityName: 'zookeepers',
				id: 11,
				fileId: 2,
				state: 'RECEIVED',
				errors: [],
				data: { systemId: 'TGR1425', new: { name: 'someone' }, old: { name: 'someone else' } },
			},
		];
		const response = findDuplicateUpdates(submissionData);
		expect(response).eql({});
	});

	it('ignores DELETE records sharing the systemId of an UPDATE', () => {
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
				data: { systemId: 'TGR1425', data: { name: 'tiger', color: 'yellow' }, isValid: true, organization: 'zoo' },
			},
		];
		const response = findDuplicateUpdates(submissionData);
		expect(response).eql({});
	});

	it('flags every UPDATE record when more than one shares a systemId in the same entity', () => {
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
				actionType: 'UPDATE',
				entityName: 'animals',
				id: 30,
				fileId: 2,
				state: 'RECEIVED',
				errors: [],
				data: { systemId: 'BR8912', new: { color: 'brown' }, old: { color: 'black' } },
			},
		];
		const conflictError = {
			reason: 'CONFLICTING_ACTION',
			systemId: 'TGR1425',
			conflictingActionType: 'UPDATE',
			message: "Record with systemId 'TGR1425' has more than one UPDATE staged in the same Active Submission",
		};
		const response = findDuplicateUpdates(submissionData);
		expect(response).eql({
			updates: {
				animals: [
					{ recordId: 10, errors: [conflictError] },
					{ recordId: 20, errors: [conflictError] },
				],
			},
		});
	});
});
