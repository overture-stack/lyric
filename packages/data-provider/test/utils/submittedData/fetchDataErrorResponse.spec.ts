import { expect } from 'chai';
import { describe, it } from 'mocha';

import { fetchDataErrorResponse } from '../../../src/utils/submittedDataUtils.js';

describe('Submitted Data Utils - fetchDataErrorResponse', () => {
	describe('Standard error response fetching data', () => {
		it('should return a response with the message its passed', () => {
			const response = fetchDataErrorResponse('Error fetching data');
			expect(response.metadata.errorMessage).to.eql('Error fetching data');
			expect(response.metadata.totalRecords).to.eq(0);
			expect(response.result).to.eql([]);
		});
		it('should return a response with empty message', () => {
			const response = fetchDataErrorResponse('');
			expect(response.metadata.errorMessage).to.eql('');
			expect(response.metadata.totalRecords).to.eq(0);
			expect(response.result).to.eql([]);
		});
	});
});
