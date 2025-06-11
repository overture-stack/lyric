import { expect } from 'chai';
import { describe, it } from 'mocha';

import {
	extractEntityNameFromFileName,
	getSeparatorCharacter,
	getValidFileExtension,
} from '../../../src/utils/files.js';

describe('File name functions', () => {
	describe('Extract entity name from file name', () => {
		it('it should return filename in lowercase', () => {
			const response = extractEntityNameFromFileName('sPoRtS.csv');
			expect(response).to.eql('sports');
		});
		it('it should return the first portion of the filename that appears before the first dot', () => {
			const response = extractEntityNameFromFileName('sports.sample.csv');
			expect(response).to.eql('sports');
		});
		it('it should return the empty string if file does not have filename just extension', () => {
			const response = extractEntityNameFromFileName('.csv');
			expect(response).to.eql('');
		});
	});
	describe('Validate file Extension', () => {
		it('should return invalid file extension', () => {
			const response = getValidFileExtension('archive.xls');
			expect(response).to.be.undefined;
		});

		it('should return invalid file extension when there is no extension', () => {
			const response = getValidFileExtension('noextension');
			expect(response).to.be.undefined;
		});

		it('should return tsv file extension', () => {
			const response = getValidFileExtension('archive.tsv');
			expect(response).to.eql('tsv');
		});
		it('should return csv file extension', () => {
			const response = getValidFileExtension('archive.csv');
			expect(response).to.eql('csv');
		});
	});

	describe('Get delimiter character from file extension', () => {
		it('should identify the delimiter character for a .csv file', () => {
			const response = getSeparatorCharacter('myFile.csv');
			expect(response).to.eql(',');
		});
		it('should identify the delimiter character for a .tsv file', () => {
			const response = getSeparatorCharacter('myFile.tsv');
			expect(response).to.eql('\t');
		});
		it('should return undefined when file extension is invalid', () => {
			const response = getSeparatorCharacter('myFile.xyz');
			expect(response).to.be.undefined;
		});
	});
});
