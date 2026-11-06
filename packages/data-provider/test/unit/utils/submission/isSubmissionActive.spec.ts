import { expect } from 'chai';
import { describe, it } from 'mocha';

import { isSubmissionActive, validationStartSubmissionStatus } from '../../../../src/utils/submissionUtils.js';
import { SUBMISSION_STATUS } from '../../../../src/utils/types.js';

describe('Submission Utils - isSubmissionActive', () => {
	describe('Determine if a Submission is considered active by its status', () => {
		it('should return true if a Submission status is OPEN', () => {
			const response = isSubmissionActive(SUBMISSION_STATUS.OPEN);
			expect(response).to.be.true;
		});
		it('should return true if a Submission status is VALID', () => {
			const response = isSubmissionActive(SUBMISSION_STATUS.VALID);
			expect(response).to.be.true;
		});
		it('should return true if a Submission status is INVALID', () => {
			const response = isSubmissionActive(SUBMISSION_STATUS.INVALID);
			expect(response).to.be.true;
		});
		it('should return false if a Submission status is VALIDATING', () => {
			const response = isSubmissionActive(SUBMISSION_STATUS.VALIDATING);
			expect(response).to.be.false;
		});
		it('should return false if a Submission status is COMMITTING', () => {
			const response = isSubmissionActive(SUBMISSION_STATUS.COMMITTING);
			expect(response).to.be.false;
		});
		it('should return false if a Submission status is CLOSED', () => {
			const response = isSubmissionActive(SUBMISSION_STATUS.CLOSED);
			expect(response).to.be.false;
		});
		it('should return false if a Submission status is COMMITTED', () => {
			const response = isSubmissionActive(SUBMISSION_STATUS.COMMITTED);
			expect(response).to.be.false;
		});
	});

	describe('Statuses a validation job can start from', () => {
		it('should only allow validation to start from OPEN', () => {
			expect(validationStartSubmissionStatus).to.eql([SUBMISSION_STATUS.OPEN]);
		});
		it('should only include statuses of an active Submission', () => {
			validationStartSubmissionStatus.forEach((status) => {
				expect(isSubmissionActive(status)).to.be.true;
			});
		});
	});
});
