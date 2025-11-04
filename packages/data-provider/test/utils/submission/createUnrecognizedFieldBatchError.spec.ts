import { expect } from 'chai';
import { describe, it } from 'mocha';

import { createUnrecognizedFieldBatchError } from '../../../src/utils/submissionResponseParser.js';

describe('Submission Utils - Create Unrecognized Field Batch Error', () => {
	it('should create an error object with correct structure and values', () => {
		const result = createUnrecognizedFieldBatchError({
			fieldName: 'systemId',
			fieldValue: 'DOESNOTEXIST',
			index: 3,
		});

		expect(result).to.eql({
			index: 3,
			fieldName: 'systemId',
			fieldValue: 'DOESNOTEXIST',
			reason: 'UNRECOGNIZED_FIELD',
		});
	});

	it('should handle zero index correctly', () => {
		const result = createUnrecognizedFieldBatchError({
			fieldName: '',
			fieldValue: '',
			index: 0,
		});

		expect(result).to.eql({
			index: 0,
			fieldName: '',
			fieldValue: '',
			reason: 'UNRECOGNIZED_FIELD',
		});
	});

	it('should handle empty values correctly', () => {
		const result = createUnrecognizedFieldBatchError({
			fieldName: '',
			fieldValue: '',
			index: 2,
		});

		expect(result).to.eql({
			index: 2,
			fieldName: '',
			fieldValue: '',
			reason: 'UNRECOGNIZED_FIELD',
		});
	});
});
