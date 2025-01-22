import { expect } from 'chai';
import { describe, it } from 'mocha';

import { extractSchemaDataFromMergedDataRecords } from '../../../src/utils/submissionUtils.js';
import { type DataRecordReference, MERGE_REFERENCE_TYPE } from '../../../src/utils/types.js';

describe('Submission Utils - Extracts an Array of DataRecord from DataRecordReference Record', () => {
	it('should process a Record with mixed SubmittedData and Submission References', () => {
		const insertSubmissionReference: DataRecordReference = {
			dataRecord: { title: 'abc' },
			reference: {
				index: 12,
				submissionId: 23,
				type: MERGE_REFERENCE_TYPE.NEW_SUBMITTED_DATA,
			},
		};
		const SubmittedDataReference: DataRecordReference = {
			dataRecord: { title: 'xyz' },
			reference: {
				submittedDataId: 10,
				type: MERGE_REFERENCE_TYPE.SUBMITTED_DATA,
				systemId: 'ABN1238',
			},
		};
		const input: Record<string, DataRecordReference[]> = {
			cars: [insertSubmissionReference, SubmittedDataReference],
		};
		const response = extractSchemaDataFromMergedDataRecords(input);
		expect(Object.keys(response)).to.eql(['cars']);
		expect(response['cars'].length).to.eq(2);
		expect(response['cars']).to.eql([{ title: 'abc' }, { title: 'xyz' }]);
	});
	it('should return empty a Record with an empty array of References', () => {
		const input: Record<string, DataRecordReference[]> = { cars: [] };
		const response = extractSchemaDataFromMergedDataRecords(input);
		expect(Object.keys(response)).to.eql(['cars']);
		expect(response['cars'].length).to.eq(0);
		expect(response['cars']).to.eql([]);
	});
	it('should return empty Record when input is an emtpy object', () => {
		const response = extractSchemaDataFromMergedDataRecords({});
		expect(Object.keys(response).length).to.eq(0);
		expect(Object.keys(response)).to.eql([]);
	});
});
