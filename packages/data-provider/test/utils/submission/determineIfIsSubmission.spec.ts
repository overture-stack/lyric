import { expect } from 'chai';
import { describe, it } from 'mocha';

import { determineIfIsSubmission } from '../../../src/utils/submissionUtils.js';
import {
	type EditSubmittedDataReference,
	MERGE_REFERENCE_TYPE,
	type NewSubmittedDataReference,
	type SubmittedDataReference,
} from '../../../src/utils/types.js';

describe('Submission Utils - Determine if processing object is a Submission or Submitted Data', () => {
	it('should return false if it is a SubmittedData referenced object', () => {
		const input: SubmittedDataReference = {
			submittedDataId: 1,
			type: MERGE_REFERENCE_TYPE.SUBMITTED_DATA,
			systemId: 'SBMT1234',
		};
		const response = determineIfIsSubmission(input);
		expect(response).to.be.false;
	});
	it('should return true if it is an insert on a Submission referenced object', () => {
		const input: NewSubmittedDataReference = {
			index: 1,
			submissionId: 1,
			type: MERGE_REFERENCE_TYPE.NEW_SUBMITTED_DATA,
		};
		const response = determineIfIsSubmission(input);
		expect(response).to.be.true;
	});
	it('should return true if it is an update on a Submission referenced object', () => {
		const input: EditSubmittedDataReference = {
			index: 1,
			submissionId: 1,
			type: MERGE_REFERENCE_TYPE.EDIT_SUBMITTED_DATA,
			systemId: 'EDT432',
		};
		const response = determineIfIsSubmission(input);
		expect(response).to.be.true;
	});
});
