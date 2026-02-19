import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { describe, it } from 'mocha';

import { extractFileExtension, getSeparatorCharacter, mapRecordToHeaders } from '../../src/utils/fileUtils.js';

use(chaiAsPromised);

describe('File Utils', () => {
	describe('Map records to headers', () => {
		it('should return an unprocessed record object', () => {
			const headers: string[] = ['id', 'name', 'description'];
			const record: string[] = ['100', 'Cat', 'Feline animal'];
			const response = mapRecordToHeaders(headers, record);
			expect(response).to.eql({ id: '100', name: 'Cat', description: 'Feline animal' });
		});
		it('should return empty object when no headers are passed', () => {
			const headers: string[] = [];
			const record: string[] = ['100', 'Cat', 'Feline animal'];
			const response = mapRecordToHeaders(headers, record);
			expect(response).to.eql({});
		});
		it('should return object with empty string values when no records are passed', () => {
			const headers: string[] = ['id', 'name', 'description'];
			const record: string[] = [];
			const response = mapRecordToHeaders(headers, record);
			expect(response).to.eql({ id: '', name: '', description: '' });
		});
	});

	describe('Validate file Extension', () => {
		it('should return invalid file extension', () => {
			const response = extractFileExtension('archive.xls');
			expect(response).to.be.undefined;
		});

		it('should return invalid file extension when there is no extension', () => {
			const response = extractFileExtension('noextension');
			expect(response).to.be.undefined;
		});

		it('should return tsv file extension', () => {
			const response = extractFileExtension('archive.tsv');
			expect(response).to.eql('tsv');
		});
		it('should return csv file extension', () => {
			const response = extractFileExtension('archive.csv');
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
