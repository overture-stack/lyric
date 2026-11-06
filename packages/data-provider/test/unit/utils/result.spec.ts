import { expect } from 'chai';
import { describe, it } from 'mocha';

import { failure, success } from '../../../src/utils/result.js';

describe('Result', () => {
	describe('success', () => {
		it('should wrap data in a success result', () => {
			const result = success({ id: 1, name: 'sport' });
			expect(result).to.eql({ success: true, data: { id: 1, name: 'sport' } });
		});
	});

	describe('failure', () => {
		it('should wrap data in a failure result', () => {
			const result = failure('something went wrong');
			expect(result).to.eql({ success: false, data: 'something went wrong' });
		});

		it('should support a non-string failure data type', () => {
			const result = failure({ code: 'NOT_FOUND' });
			expect(result).to.eql({ success: false, data: { code: 'NOT_FOUND' } });
		});
	});
});
