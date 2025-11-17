import { expect } from 'chai';
import { describe, it } from 'mocha';

import { createInvalidValueBatchError } from '../../../src/utils/submissionResponseParser.js';

describe('Submission Utils - Create Unrecognized Field Batch Error', () => {
	it('should create an error object with correct structure and values', () => {
		const result = createInvalidValueBatchError({
			fieldName: 'systemId',
			fieldValue: 'DOESNOTEXIST',
			index: 3,
		});

		expect(result).to.eql({
			index: 3,
			fieldName: 'systemId',
			fieldValue: 'DOESNOTEXIST',
			reason: 'INVALID_BY_RESTRICTION',
			errors: [
				{
					message: 'Value does not match any existing record.',
					restriction: {
						rule: true,
						type: 'required',
					},
				},
			],
		});
	});

	it('should handle zero index correctly', () => {
		const result = createInvalidValueBatchError({
			fieldName: '',
			fieldValue: '',
			index: 0,
		});

		expect(result).to.eql({
			index: 0,
			fieldName: '',
			fieldValue: '',
			reason: 'INVALID_BY_RESTRICTION',
			errors: [
				{
					message: 'Value does not match any existing record.',
					restriction: {
						rule: true,
						type: 'required',
					},
				},
			],
		});
	});

	it('should handle empty values correctly', () => {
		const result = createInvalidValueBatchError({
			fieldName: '',
			fieldValue: '',
			index: 2,
		});

		expect(result).to.eql({
			index: 2,
			fieldName: '',
			fieldValue: '',
			reason: 'INVALID_BY_RESTRICTION',
			errors: [
				{
					message: 'Value does not match any existing record.',
					restriction: {
						rule: true,
						type: 'required',
					},
				},
			],
		});
	});
});
