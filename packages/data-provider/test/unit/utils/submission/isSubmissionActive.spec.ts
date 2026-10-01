import { expect } from 'chai';
import { describe, it } from 'mocha';

import { isSubmissionActive, validationStartSubmissionStatus } from '../../../../src/utils/submissionUtils.js';

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
		it('should return false if a Submission status is VALIDATING', () => {
			const response = isSubmissionActive('VALIDATING');
			expect(response).to.be.false;
		});
		it('should return false if a Submission status is COMMITTING', () => {
			const response = isSubmissionActive('COMMITTING');
			expect(response).to.be.false;
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

	describe('Statuses a validation job can start from', () => {
		it('should only allow validation to start from OPEN', () => {
			expect(validationStartSubmissionStatus).to.eql(['OPEN']);
		});
		it('should only include statuses of an active Submission', () => {
			validationStartSubmissionStatus.forEach((status) => {
				expect(isSubmissionActive(status)).to.be.true;
			});
		});
	});
});
