import { expect } from 'chai';
import { describe, it } from 'mocha';

import { isSubmissionActive } from '../../../src/utils/submissionUtils.js';

describe('Submission Utils - isSubmissionActive', () => {
	describe('Determine if a Submission is considered active by its status', () => {
		it('should return true if a Submission status is OPEN', () => {
			const response = isSubmissionActive('OPEN');
			expect(response).to.be.true;
		});
		it('should return true if a Submission status is VALID', () => {
			const response = isSubmissionActive('VALID');
			expect(response).to.be.true;
		});
		it('should return true if a Submission status is INVALID', () => {
			const response = isSubmissionActive('INVALID');
			expect(response).to.be.true;
		});
		it('should return false if a Submission status is CLOSED', () => {
			const response = isSubmissionActive('CLOSED');
			expect(response).to.be.false;
		});
		it('should return false if a Submission status is COMMITTED', () => {
			const response = isSubmissionActive('COMMITTED');
			expect(response).to.be.false;
		});
	});
});
