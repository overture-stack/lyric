import { expect } from 'chai';
import { describe, it } from 'mocha';

import type { SubmissionRecordWithEntityName } from '../../../../src/repository/submissionRecordsRepository.js';
import { findStagedActionsForSystemIds } from '../../../../src/utils/submissionRecordUtils.js';

describe('Submission Utils - Find Staged Actions For System IDs', () => {
	const existingSubmissionRecords: SubmissionRecordWithEntityName[] = [
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
			fileId: 2,
			state: 'RECEIVED',
			errors: [],
			data: { systemId: 'BR8912', data: { name: 'bear', color: 'black' }, isValid: true, organization: 'zoo' },
		},
		{
			actionType: 'UPDATE',
			entityName: 'zookeepers',
			id: 12,
			fileId: 3,
			state: 'RECEIVED',
			errors: [],
			data: { systemId: 'ZK001', new: { name: 'someone' }, old: { name: 'someone else' } },
		},
		{
			actionType: 'INSERT',
			entityName: 'animals',
			id: 13,
			fileId: 4,
			state: 'RECEIVED',
			errors: [],
			data: { systemId: 'LN0001', name: 'lion' },
		},
	];

	it('returns empty lists when there are no staged records', () => {
		const response = findStagedActionsForSystemIds({
			entityName: 'animals',
			existingSubmissionRecords: [],
			systemIds: ['TGR1425'],
		});
		expect(response).eql({ updatedSystemIds: [], deletedSystemIds: [] });
	});

	it('returns the system IDs with a staged UPDATE and those with a staged DELETE', () => {
		const response = findStagedActionsForSystemIds({
			entityName: 'animals',
			existingSubmissionRecords,
			systemIds: ['BR8912', 'TGR1425', 'EL7777'],
		});
		expect(response).eql({ updatedSystemIds: ['TGR1425'], deletedSystemIds: ['BR8912'] });
	});

	it('ignores records staged for other entities', () => {
		const response = findStagedActionsForSystemIds({
			entityName: 'animals',
			existingSubmissionRecords,
			systemIds: ['ZK001'],
		});
		expect(response).eql({ updatedSystemIds: [], deletedSystemIds: [] });
	});

	it('ignores INSERT records', () => {
		const response = findStagedActionsForSystemIds({
			entityName: 'animals',
			existingSubmissionRecords,
			systemIds: ['LN0001'],
		});
		expect(response).eql({ updatedSystemIds: [], deletedSystemIds: [] });
	});
});
