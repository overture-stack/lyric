import { expect } from 'chai';
import { describe, it } from 'mocha';

import { mapRecordToHeaders } from '../../../src/utils/files.js';

describe('File parser', () => {
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
});
