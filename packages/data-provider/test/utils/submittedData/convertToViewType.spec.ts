import { expect } from 'chai';
import { describe, it } from 'mocha';

import { convertToViewType } from '../../../src/utils/submittedDataUtils.js';
import { VIEW_TYPE } from '../../../src/utils/types.js';

describe('Submitted Data Utils - convertToViewType', () => {
	it('should return flat ViewType when a string is provided', () => {
		const result = convertToViewType('flat');
		expect(result).to.equal(VIEW_TYPE.Values.flat);
	});
	it('should return compound ViewType when a string is provided with spaces', () => {
		const result = convertToViewType('  compound  ');
		expect(result).to.equal(VIEW_TYPE.Values.compound);
	});

	it('should return undefined for an invalid string', () => {
		const result = convertToViewType('InvalidValue');
		expect(result).to.eql(undefined);
	});

	it('should return undefined if input is not a string', () => {
		const result = convertToViewType(123);
		expect(result).to.eql(undefined);
	});

	it('should return undefined if the string is empty', () => {
		const result = convertToViewType('');
		expect(result).to.eql(undefined);
	});

	it('should return undefined for an undefined value is passed', () => {
		const result = convertToViewType(undefined);
		expect(result).to.eql(undefined);
	});
});
