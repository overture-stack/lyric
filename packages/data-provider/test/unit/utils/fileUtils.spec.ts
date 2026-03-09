import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { describe, it } from 'mocha';

import { getSeparatorCharacter, mapRecordToHeaders } from '../../../src/utils/fileUtils.js';
import { createMulterFile } from '../../fixtures/createMulterFile.js';

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

	describe('Get delimiter character from file extension', () => {
		it('should identify the delimiter character for a .csv file', () => {
			const response = getSeparatorCharacter(createMulterFile({ originalname: 'myFile.csv' }));
			expect(response).to.eql(',');
		});
		it('should identify the delimiter character for a .tsv file', () => {
			const response = getSeparatorCharacter(createMulterFile({ originalname: 'myFile.tsv' }));
			expect(response).to.eql('\t');
		});
		it('should return undefined when file extension is invalid', () => {
			const response = getSeparatorCharacter(createMulterFile({ originalname: 'myFile.xyz' }));
			expect(response).to.be.undefined;
		});
	});
});
