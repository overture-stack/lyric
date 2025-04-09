import { expect } from 'chai';
import { describe, it } from 'mocha';

import { canTransitionToClosed } from '../../../src/utils/submissionUtils.js';

describe('Submission Utils - canTransitionToClosed', () => {
	describe('Determine if a Submission is on the right status to be closed', () => {
		it('should return true if a Submission status is OPEN', () => {
			const response = canTransitionToClosed('OPEN');
			expect(response).to.eql(true);
		});
		it('should return true if a Submission status is VALID', () => {
			const response = canTransitionToClosed('VALID');
			expect(response).to.eql(true);
		});
		it('should return true if a Submission status is INVALID', () => {
			const response = canTransitionToClosed('INVALID');
			expect(response).to.eql(true);
		});
		it('should return false if a Submission status is CLOSED', () => {
			const response = canTransitionToClosed('CLOSED');
			expect(response).to.eql(false);
		});
		it('should return false if a Submission status is COMMITTED', () => {
			const response = canTransitionToClosed('COMMITTED');
			expect(response).to.eql(false);
		});
	});
});
