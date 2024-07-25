import { expect } from 'chai';
import { describe, it } from 'mocha';

import { isArrayWithValues, isEmptyString, isValidIdNumber, uniqueCharacters } from '../../src/utils/formatUtils.js';

describe('Format Utils', () => {
	describe('Validate if input is a valid ID number', () => {
		it('should return true if input is a valid number', () => {
			const validNumber = 1;
			const response = isValidIdNumber(validNumber);
			expect(response).to.be.true;
		});

		it('should return false if input is a negative number', () => {
			const invalidNumber = -99;
			const response = isValidIdNumber(invalidNumber);
			expect(response).to.be.false;
		});

		it('should return false if input is zero', () => {
			const invalidNumber = 0;
			const response = isValidIdNumber(invalidNumber);
			expect(response).to.be.false;
		});

		it('should return false if input is a string', () => {
			const invalidNumber = 'one';
			const response = isValidIdNumber(invalidNumber);
			expect(response).to.be.false;
		});

		it('should return false if input is numeric string', () => {
			const invalidNumber = '1';
			const response = isValidIdNumber(invalidNumber);
			expect(response).to.be.false;
		});

		it('should return false if input is null', () => {
			const invalidNumber = null;
			const response = isValidIdNumber(invalidNumber);
			expect(response).to.be.false;
		});

		it('should return false if input is empty string', () => {
			const invalidNumber = '';
			const response = isValidIdNumber(invalidNumber);
			expect(response).to.be.false;
		});

		it('should return false if input is Infinity', () => {
			const invalidNumber = Infinity;
			const response = isValidIdNumber(invalidNumber);
			expect(response).to.be.false;
		});

		it('should return false if input is NaN', () => {
			const invalidNumber = NaN;
			const response = isValidIdNumber(invalidNumber);
			expect(response).to.be.false;
		});

		it('should return false if input is undefined', () => {
			const invalidNumber = undefined;
			const response = isValidIdNumber(invalidNumber);
			expect(response).to.be.false;
		});

		it('should return false if input is more than the maximum number', () => {
			const invalidNumber = Number.MAX_VALUE + 1;
			const response = isValidIdNumber(invalidNumber);
			expect(response).to.be.false;
		});
	});

	describe('Extract unique characters on a String', () => {
		it('should return unique characters on a string', () => {
			const duplicateCharactersString = 'AAABBC123';
			const uniqueCharactersString = 'ABC123';
			const response = uniqueCharacters(duplicateCharactersString);
			expect(response).to.eql(uniqueCharactersString);
		});

		it('should return unique characters on a string with spaces', () => {
			const duplicateCharactersString = ' A AA BB C 1 2 3 ';
			const uniqueCharactersString = 'ABC123';
			const response = uniqueCharacters(duplicateCharactersString);
			expect(response).to.eql(uniqueCharactersString);
		});
	});

	describe('Validate if input string is empty', () => {
		it('should return true if string is empty', () => {
			const emptyString = '';
			const response = isEmptyString(emptyString);
			expect(response).to.be.true;
		});

		it('should return true if string has only spaces or tabs', () => {
			const emptyString = '        	    ';
			const response = isEmptyString(emptyString);
			expect(response).to.be.true;
		});

		it('should return true if input is null', () => {
			const emptyString = null;
			const response = isEmptyString(emptyString);
			expect(response).to.be.true;
		});

		it('should return true if input is undefined', () => {
			const emptyString = undefined;
			const response = isEmptyString(emptyString);
			expect(response).to.be.true;
		});

		it('should return false if string is not empty', () => {
			const emptyString = 'test';
			const response = isEmptyString(emptyString);
			expect(response).to.be.false;
		});

		it('should return false if input is boolean', () => {
			const emptyString = false;
			const response = isEmptyString(emptyString);
			expect(response).to.be.false;
		});

		it('should return false if input is 0', () => {
			const emptyString = 0;
			const response = isEmptyString(emptyString);
			expect(response).to.be.false;
		});

		it('should return false if input is NaN', () => {
			const emptyString = NaN;
			const response = isEmptyString(emptyString);
			expect(response).to.be.false;
		});

		it('should return false if input is empty array', () => {
			const emptyString: string[] = [];
			const response = isEmptyString(emptyString);
			expect(response).to.be.false;
		});
	});

	describe('Validate if array of string contains any values', () => {
		it('should return false if array is empty', () => {
			const emptyArray: string[] = [];
			const response = isArrayWithValues(emptyArray);
			expect(response).to.be.false;
		});

		it('should return true if array is not empty', () => {
			const arrayOfStrings: string[] = ['apple', 'orange'];
			const response = isArrayWithValues(arrayOfStrings);
			expect(response).to.be.true;
		});

		it('should return false if array has null value', () => {
			const unknownArray: unknown = [null];
			const response = isArrayWithValues(unknownArray);
			expect(response).to.be.false;
		});

		it('should return false if array has undefined value', () => {
			const unknownArray: unknown = [undefined];
			const response = isArrayWithValues(unknownArray);
			expect(response).to.be.false;
		});

		it('should return true if array has string values and null', () => {
			const unknownArray: unknown = ['oranges', null];
			const response = isArrayWithValues(unknownArray);
			expect(response).to.be.true;
		});
	});
});
