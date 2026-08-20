import { expect } from 'chai';
import { describe, it } from 'mocha';

import type { SubmissionRecordWithEntityName } from '../../../../src/repository/submissionRecordsRepository.js';
import { isUpdateSubmissionRecord } from '../../../../src/utils/submissionUtils.js';

describe('isUpdateSubmissionRecord', () => {
	it('should return true when actionType is UPDATE', () => {
		const record: SubmissionRecordWithEntityName = {
			actionType: 'UPDATE',
			entityName: 'animals',
			id: 1,
			fileId: 1,
			state: 'RECEIVED',
			errors: [],
			data: { systemId: 'TGR1425', new: { color: 'orange' }, old: { color: 'yellow' } },
		};

		expect(isUpdateSubmissionRecord(record)).to.be.true;
	});

	it('should return false when actionType is INSERT', () => {
		const record: SubmissionRecordWithEntityName = {
			actionType: 'INSERT',
			entityName: 'animals',
			id: 2,
			fileId: 1,
			state: 'RECEIVED',
			errors: [],
			data: { name: 'elephant', color: 'gray' },
		};

		expect(isUpdateSubmissionRecord(record)).to.be.false;
	});

	it('should return false when actionType is DELETE', () => {
		const record: SubmissionRecordWithEntityName = {
			actionType: 'DELETE',
			entityName: 'animals',
			id: 3,
			fileId: 1,
			state: 'RECEIVED',
			errors: [],
			data: { systemId: 'TGR1425', data: { name: 'tiger', color: 'yellow' }, isValid: true, organization: 'zoo' },
		};

		expect(isUpdateSubmissionRecord(record)).to.be.false;
	});
});
