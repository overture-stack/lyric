import { expect } from 'chai';
import { describe, it } from 'mocha';

import {
	isArrayWithValues,
	isEmptyString,
	isValidDateFormat,
	isValidIdNumber,
	uniqueCharacters,
} from '../../src/utils/formatUtils.js';

describe('Format Utils tests', () => {
	it('should return true if input is a valid number', () => {
		const validNumber = 1;
		const response = isValidIdNumber(validNumber);
		expect(response).to.be.true;
	});

	it('should return false if input is a not a valid number', () => {
		const invalidNumber = 'one';
		const response = isValidIdNumber(invalidNumber);
		expect(response).to.be.false;
	});

	it('should return unique characters on a string', () => {
		const duplicateCharactersString = 'AAABBC';
		const uniqueCharactersString = 'ABC';
		const response = uniqueCharacters(duplicateCharactersString);
		expect(response).to.eql(uniqueCharactersString);
	});

	it('should determine if string is empty', () => {
		const emptyString = '';
		const response = isEmptyString(emptyString);
		expect(response).to.be.true;
	});

	it('should determine if array has any values', () => {
		const emptyArray: string[] = [];
		const response = isArrayWithValues(emptyArray);
		expect(response).to.be.false;
	});

	describe('Validate date is valid', () => {
		it('should return true if input is a string that represents a valid ISO format', () => {
			const response = isValidDateFormat('2000-01-01');
			expect(response).to.be.true;
		});

		it('should return false if input is a string with invalid date', () => {
			const response = isValidDateFormat('0000-99-00');
			expect(response).to.be.false;
		});

		it('should return false if string in invalid date format', () => {
			const response = isValidDateFormat('123456789');
			expect(response).to.be.false;
		});
	});
});
