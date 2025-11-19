import { expect } from 'chai';
import { describe, it } from 'mocha';

import { findEditSubmittedData } from '../../../index.js';
import { type DataRecordReference, MERGE_REFERENCE_TYPE } from '../../../src/utils/types.js';

const recordsByEntityName: Record<string, DataRecordReference[]> = {
	animals: [
		{
			dataRecord: { name: 'Bird', color: 'blue' },
			reference: {
				systemId: 'BB4546',
				submissionId: 2,
				index: 0,
				type: MERGE_REFERENCE_TYPE.EDIT_SUBMITTED_DATA,
			},
		},
		{
			dataRecord: { name: 'Dinosaur', color: 'red' },
			reference: {
				systemId: 'DINO8912',
				submissionId: 2,
				index: 1,
				type: MERGE_REFERENCE_TYPE.EDIT_SUBMITTED_DATA,
			},
		},
	],
	teams: [
		{
			dataRecord: { title: 'Raptors' },
			reference: {
				systemId: 'RPT5678',
				submissionId: 2,
				index: 3,
				type: MERGE_REFERENCE_TYPE.EDIT_SUBMITTED_DATA,
			},
		},
		{
			dataRecord: { tile: 'Blue Jays' },
			reference: {
				systemId: 'BJ1425',
				submittedDataId: 45,
				type: MERGE_REFERENCE_TYPE.SUBMITTED_DATA,
			},
		},
	],
};

describe('Submission Utils - Find Edited Submitted Data by systemId', () => {
	it('should return true when matching entityName and systemId and marked to edit', () => {
		const result = findEditSubmittedData('animals', 'BB4546', recordsByEntityName);
		expect(result).to.be.true;
	});

	it('should return false when matching systemId but not entityName', () => {
		const result = findEditSubmittedData('teams', 'BB4546', recordsByEntityName);
		expect(result).to.be.false;
	});

	it('should return false when matching systemId and entityName but not marked to edit', () => {
		const result = findEditSubmittedData('teams', 'BJ1425', recordsByEntityName);
		expect(result).to.be.false;
	});

	it('should return false when systemId not found', () => {
		const result = findEditSubmittedData('animals', 'DOESNOTEXISTS', recordsByEntityName);
		expect(result).to.be.false;
	});

	it('should return false when entityName does not exist', () => {
		const result = findEditSubmittedData('incorrect', 'DINO8912', recordsByEntityName);
		expect(result).to.be.false;
	});

	it('should return false when there are no records to find', () => {
		const result = findEditSubmittedData('animals', 'DINO8912', {});
		expect(result).to.be.false;
	});
});
