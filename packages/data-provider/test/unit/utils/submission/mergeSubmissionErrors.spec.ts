import { expect } from 'chai';
import { describe, it } from 'mocha';

import { mergeSubmissionErrors, type SubmissionErrors } from '../../../../src/utils/submissionUtils.js';

describe('Submission Utils - Merge Submission Errors', () => {
	it('returns an empty object when both inputs are empty', () => {
		const response = mergeSubmissionErrors({}, {});
		expect(response).eql({});
	});

	it('returns the empty object without setting keys for buckets neither input has', () => {
		const response = mergeSubmissionErrors({}, {});
		expect(Object.keys(response)).to.eql([]);
	});

	it('returns the other input unchanged when one side is empty', () => {
		const a: SubmissionErrors = { updates: { animals: [{ recordId: 1, errors: [] }] } };
		const response = mergeSubmissionErrors(a, {});
		expect(response).eql(a);
	});

	it('concatenates entity error arrays instead of overwriting them', () => {
		const a: SubmissionErrors = {
			updates: { animals: [{ recordId: 1, errors: [] }] },
		};
		const b: SubmissionErrors = {
			updates: { animals: [{ recordId: 2, errors: [] }] },
		};
		const response = mergeSubmissionErrors(a, b);
		expect(response.updates?.['animals']?.map((record) => record.recordId)).to.eql([1, 2]);
	});

	it('merges different buckets and different entities independently', () => {
		const a: SubmissionErrors = {
			updates: { animals: [{ recordId: 1, errors: [] }] },
			deletes: { animals: [{ recordId: 2, errors: [] }] },
		};
		const b: SubmissionErrors = {
			inserts: { plants: [{ recordId: 3, errors: [] }] },
			updates: { plants: [{ recordId: 4, errors: [] }] },
		};
		const response = mergeSubmissionErrors(a, b);
		expect(response.updates?.['animals']?.map((record) => record.recordId)).to.eql([1]);
		expect(response.updates?.['plants']?.map((record) => record.recordId)).to.eql([4]);
		expect(response.deletes?.['animals']?.map((record) => record.recordId)).to.eql([2]);
		expect(response.inserts?.['plants']?.map((record) => record.recordId)).to.eql([3]);
	});
});
