import { expect } from 'chai';
import { describe, it } from 'mocha';

import { computeDataDiff } from '../../../src/utils/submittedDataUtils.js';

describe('Submitted Data Utils - computeDataDiff', () => {
	describe('Find the differences between 2 records', () => {
		it('should return a "DataDiff" object', () => {
			const response = computeDataDiff({}, {});
			expect(Object.keys(response).length).to.eq(2);
			expect(Object.prototype.hasOwnProperty.call(response, 'old')).to.eql(true);
			expect(Object.prototype.hasOwnProperty.call(response, 'new')).to.eql(true);
		});
		it('should return no change between 2 null values', () => {
			const response = computeDataDiff(null, null);
			expect(response.old).to.eql({});
			expect(response.new).to.eql({});
		});
		it('should return no change between null and empty objects', () => {
			const response = computeDataDiff(null, {});
			expect(response.old).to.eql({});
			expect(response.new).to.eql({});
		});
		it('should return no change between 2 empty objects', () => {
			const response = computeDataDiff({}, {});
			expect(response.old).to.eql({});
			expect(response.new).to.eql({});
		});
		it('should return no change between 2 objects with same values', () => {
			const object1 = { title: 'abc' };
			const object2 = { title: 'abc' };
			const response = computeDataDiff(object1, object2);
			expect(response.old).to.eql({});
			expect(response.new).to.eql({});
		});
		it('should return new fields added to newRecord', () => {
			const object1 = { title: 'abc' };
			const object2 = { title: 'abc', description: 'this is a description' };
			const response = computeDataDiff(object1, object2);
			expect(response.old).to.eql({});
			expect(response.new).to.eql({ description: 'this is a description' });
		});
		it('should return undefined fields from newRecord', () => {
			const object1 = { title: 'abc' };
			const object2 = {};
			const response = computeDataDiff(object1, object2);
			expect(response.old).to.eql({ title: 'abc' });
			expect(response.new).to.eql({ title: undefined });
		});
		it('should return fields removed from newRecord when newRecord is null', () => {
			const object1 = { title: 'abc' };
			const object2 = null;
			const response = computeDataDiff(object1, object2);
			expect(response.old).to.eql({ title: 'abc' });
			expect(response.new).to.eql({});
		});
		it('should return values changed from oldRecord to newRecord', () => {
			const object1 = { title: 'abc' };
			const object2 = { title: 'xyz' };
			const response = computeDataDiff(object1, object2);
			expect(response.old).to.eql({ title: 'abc' });
			expect(response.new).to.eql({ title: 'xyz' });
		});
		it('should return whole newRecord when compared to empty oldRecord', () => {
			const object1 = {};
			const object2 = { title: 'xyz', description: 'this is a description' };
			const response = computeDataDiff(object1, object2);
			expect(response.old).to.eql({});
			expect(response.new).to.eql({ title: 'xyz', description: 'this is a description' });
		});
		it('should return whole newRecord when compared to null oldRecord', () => {
			const object1 = null;
			const object2 = { title: 'xyz', description: 'this is a description' };
			const response = computeDataDiff(object1, object2);
			expect(response.old).to.eql({});
			expect(response.new).to.eql({ title: 'xyz', description: 'this is a description' });
		});
		it('should return fields with undefined values when compared to null newRecord', () => {
			const object1 = { title: 'xyz', description: 'this is a description' };
			const object2 = {};
			const response = computeDataDiff(object1, object2);
			expect(response.old).to.eql({ title: 'xyz', description: 'this is a description' });
			expect(response.new).to.eql({ title: undefined, description: undefined });
		});
		it('should return fields with empty values when compared to empty values newRecord', () => {
			const object1 = { title: 'xyz', description: 'this is a description' };
			const object2 = { title: '', description: '' };
			const response = computeDataDiff(object1, object2);
			expect(response.old).to.eql({ title: 'xyz', description: 'this is a description' });
			expect(response.new).to.eql({ title: '', description: '' });
		});
	});
});
