import { expect } from 'chai';
import { describe, it } from 'mocha';

import { mergeRecords } from '../../../src/utils/submissionUtils.js';

describe('Submission Utils - Merge 2 generic Records into a single Record', () => {
	it('should return empty object when passing 2 undefined objects', () => {
		const response = mergeRecords(undefined, undefined);
		expect(Object.keys(response).length).to.eq(0);
		expect(response).to.eql({});
	});
	it('should concat values of a undefined objects', () => {
		const record1 = { name: ['Tom', 'Jerry'] };
		const response1 = mergeRecords(record1, undefined);
		expect(Object.keys(response1)).to.eql(['name']);
		expect(response1['name'].length).to.eq(2);
		expect(response1['name']).to.eql(['Tom', 'Jerry']);

		const record2 = { name: ['Bob', 'Patrick'] };
		const response2 = mergeRecords(undefined, record2);
		expect(Object.keys(response2)).to.eql(['name']);
		expect(response2['name'].length).to.eq(2);
		expect(response2['name']).to.eql(['Bob', 'Patrick']);
	});
	it('should concat values of the 2 passing records', () => {
		const record1 = { name: ['Tom', 'Jerry'] };
		const record2 = { name: ['Bob', 'Patrick'] };
		const response = mergeRecords(record1, record2);
		expect(Object.keys(response)).to.eql(['name']);
		expect(response['name'].length).to.eq(4);
		expect(response['name']).to.eql(['Tom', 'Jerry', 'Bob', 'Patrick']);
	});
});
