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

		it('should return false if input is a not a valid number', () => {
			const invalidNumber = 'one';
			const response = isValidIdNumber(invalidNumber);
			expect(response).to.be.false;
		});
	});

	describe('Extract unique characters on a String', () => {
		it('should return unique characters on a string', () => {
			const duplicateCharactersString = 'AAABBC';
			const uniqueCharactersString = 'ABC';
			const response = uniqueCharacters(duplicateCharactersString);
			expect(response).to.eql(uniqueCharactersString);
		});
	});

	describe('Validate if input string is empty or not', () => {
		it('should return true if string is empty', () => {
			const emptyString = '';
			const response = isEmptyString(emptyString);
			expect(response).to.be.true;
		});

		it('should return false if string is not empty', () => {
			const emptyString = 'test';
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
	});
});
