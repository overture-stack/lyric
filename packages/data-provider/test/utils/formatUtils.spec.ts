import { expect } from 'chai';
import { describe, it } from 'mocha';

import {
	asArray,
	isArrayWithValues,
	isEmptyString,
	isValidDateFormat,
	isValidIdNumber,
	uniqueCharacters,
} from '../../src/utils/formatUtils.js';

describe('Format Utils', () => {
	describe('Wrap any value into array', () => {
		it('should return an empty array when the value is undefined', () => {
			const result = asArray(undefined);
			expect(result).to.eql([]); // Expecting an empty array
		});

		it('should return an empty array when the value is null', () => {
			const result = asArray(null);
			expect(result).to.eql([]); // Expecting an empty array
		});

		it('should return the same array when the value is already an array', () => {
			const input = ['a', 'b', 'c'];
			const result = asArray(input);
			expect(result).to.eql(input);
		});

		it('should return an array with a single value when a single value is passed', () => {
			const input = 'singleValue';
			const result = asArray(input);
			expect(result).to.eql([input]);
		});

		it('should exclude undefined values when the value is an array with undefined', () => {
			const input = ['a', undefined, 'b'];
			const result = asArray(input);
			expect(result).to.eql(['a', 'b']);
		});

		it('should exclude undefined values when a single value is undefined', () => {
			const input = undefined;
			const result = asArray(input);
			expect(result).to.eql([]);
		});

		it('should filter out empty strings and undefined values ', () => {
			const input = [0, false, '', undefined, 'valid'];
			const result = asArray(input);
			expect(result).to.eql([0, false, 'valid']);
		});
	});
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

	describe('Validate if input is a valid date', () => {
		it('should return true if input is a YYYY-MM-DD string date format', () => {
			const input = '2000-01-01';
			const response = isValidDateFormat(input);
			expect(response).to.be.true;
		});

		it('should return true if input is a YYYY-MM date format', () => {
			const input = '2000-01';
			const response = isValidDateFormat(input);
			expect(response).to.be.true;
		});

		it('should return true if input is a YYYY date format', () => {
			const input = '2000';
			const response = isValidDateFormat(input);
			expect(response).to.be.true;
		});

		it('should return false if input contains only letters', () => {
			const input = 'not_a_date';
			const response = isValidDateFormat(input);
			expect(response).to.be.false;
		});

		it('should return false if input contains only numbers', () => {
			const input = '20000101';
			const response = isValidDateFormat(input);
			expect(response).to.be.false;
		});
	});
});
