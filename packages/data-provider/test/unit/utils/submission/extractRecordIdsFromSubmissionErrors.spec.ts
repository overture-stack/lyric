import { expect } from 'chai';
import { describe, it } from 'mocha';

import { extractRecordIdsFromSubmissionErrors, type SubmissionErrors } from '../../../../src/utils/submissionUtils.js';

describe('Submission Utils - Extract Record Ids From Submission Errors', () => {
	it('returns an empty Set when there are no errors', () => {
		const response = extractRecordIdsFromSubmissionErrors({});
		expect(response.size).to.eq(0);
	});

	it('collects recordIds across every bucket and entity', () => {
		const errors: SubmissionErrors = {
			inserts: { plants: [{ recordId: 1, errors: [] }] },
			updates: { animals: [{ recordId: 2, errors: [] }, { recordId: 3, errors: [] }] },
			deletes: { animals: [{ recordId: 4, errors: [] }] },
		};
		const response = extractRecordIdsFromSubmissionErrors(errors);
		expect([...response]).to.have.members([1, 2, 3, 4]);
	});

	it('deduplicates a recordId that appears more than once', () => {
		const errors: SubmissionErrors = {
			updates: { animals: [{ recordId: 5, errors: [] }] },
			deletes: { animals: [{ recordId: 5, errors: [] }] },
		};
		const response = extractRecordIdsFromSubmissionErrors(errors);
		expect([...response]).to.eql([5]);
	});
});
