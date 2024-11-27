import { expect } from 'chai';
import { describe, it } from 'mocha';

import { type DictionaryValidationRecordErrorDetails, type SchemaRecordError } from '@overture-stack/lectern-client';
import type { NewSubmittedData, SubmittedData } from '@overture-stack/lyric-data-model/models';

import {
	computeDataDiff,
	fetchDataErrorResponse,
	getEntityNamesFromFilterOptions,
	groupErrorsByIndex,
	groupSchemaDataByEntityName,
	hasErrorsByIndex,
	transformmSubmittedDataToSubmissionDeleteData,
} from '../../src/utils/submittedDataUtils.js';
import { VIEW_TYPE } from '../../src/utils/types.js';

describe('Submitted Data Utils', () => {
	const todaysDate = new Date();
	describe('Find the differences between 2 records', () => {
		it('should return a "DataDiff" object', () => {
			const response = computeDataDiff({}, {});
			expect(Object.keys(response).length).to.eq(2);
			expect(Object.prototype.hasOwnProperty.call(response, 'old')).to.be.true;
			expect(Object.prototype.hasOwnProperty.call(response, 'new')).to.be.true;
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
	describe('Standard error response fetching data', () => {
		it('should return a response with the message its passed', () => {
			const response = fetchDataErrorResponse('Error fetching data');
			expect(response.metadata.errorMessage).to.eql('Error fetching data');
			expect(response.metadata.totalRecords).to.eq(0);
			expect(response.result).to.eql([]);
		});
		it('should return a response with empty message', () => {
			const response = fetchDataErrorResponse('');
			expect(response.metadata.errorMessage).to.eql('');
			expect(response.metadata.totalRecords).to.eq(0);
			expect(response.result).to.eql([]);
		});
	});

	describe('Determine the entity names based on the provided filter', () => {
		it('should return an array with defaultCentricEntity if view is compound', () => {
			const filterOptions = { view: VIEW_TYPE.Values.compound, entityName: ['entity1', 'entity2'] };
			const result = getEntityNamesFromFilterOptions(filterOptions, 'defaultEntity');
			expect(result).to.eql(['defaultEntity']);
		});

		it('should return entityName array if view is not compound and entityName is provided', () => {
			const filterOptions = { view: VIEW_TYPE.Values.flat, entityName: ['entity1', 'entity2'] };
			const result = getEntityNamesFromFilterOptions(filterOptions, undefined);
			expect(result).to.eql(['entity1', 'entity2']);
		});

		it('should return an empty array if neither defaultCentricEntity nor entityName are provided', () => {
			const filterOptions = { view: VIEW_TYPE.Values.flat, entityName: [] };
			const result = getEntityNamesFromFilterOptions(filterOptions, undefined);
			expect(result).to.eql([]);
		});

		it('should return an empty array if entityName is undefined and view is not compound', () => {
			const filterOptions = { view: VIEW_TYPE.Values.flat };
			const result = getEntityNamesFromFilterOptions(filterOptions, undefined);
			expect(result).to.eql([]);
		});
	});

	describe('Group validation errors by index', () => {
		it('should return the errors by index', () => {
			const listOfErrors: SchemaRecordError<DictionaryValidationRecordErrorDetails>[] = [
				{
					recordIndex: 0,
					recordErrors: [
						{
							fieldName: 'systemId',
							reason: 'INVALID_BY_RESTRICTION',
							fieldValue: '',
							errors: [],
						},
					],
				},
				{
					recordIndex: 1,
					recordErrors: [
						{
							reason: `INVALID_BY_RESTRICTION`,
							fieldName: 'sex_at_birth',
							fieldValue: 'Homme',
							errors: [],
						},
					],
				},
			];
			const response = groupErrorsByIndex(listOfErrors);
			expect(Object.keys(response).length).to.eq(2);
			expect(response[0]).to.eql([
				{
					fieldName: 'systemId',
					reason: 'INVALID_BY_RESTRICTION',
					fieldValue: '',
					errors: [],
				},
			]);
			expect(response[1]).to.eql([
				{
					reason: `INVALID_BY_RESTRICTION`,
					fieldName: 'sex_at_birth',
					fieldValue: 'Homme',
					errors: [],
				},
			]);
		});
		it('should return an empty array if no errors are passed', () => {
			const listOfErrors: SchemaRecordError<DictionaryValidationRecordErrorDetails>[] = [];

			const response = groupErrorsByIndex(listOfErrors);
			expect(Object.keys(response).length).to.eq(0);
		});
	});
	describe('Merge new data and submitted data and group them by entity name', () => {
		it('return an object with empty values when using empty objects', () => {
			const response = groupSchemaDataByEntityName({});
			expect(Object.keys(response).length).to.eq(2);
			expect(Object.keys(response.submittedDataByEntityName).length).to.eql(0);
			expect(Object.keys(response.schemaDataByEntityName).length).to.eql(0);
		});
		it('merge 2 non empty objects', () => {
			const newData: NewSubmittedData[] = [
				{
					data: {
						name: 'Bugatti La Voiture Noire',
					},
					dictionaryCategoryId: 1,
					entityName: 'cars',
					isValid: true,
					lastValidSchemaId: 1,
					organization: 'mycollection',
					originalSchemaId: 1,
					systemId: 'XYZ456',
				},
			];
			const submittedData: SubmittedData[] = [
				{
					id: 1,
					data: {
						name: 'Lamborghini Revuelto',
					},
					dictionaryCategoryId: 1,
					entityName: 'cars',
					isValid: true,
					lastValidSchemaId: 1,
					organization: 'mycollection',
					originalSchemaId: 1,
					systemId: 'ABC123',
					createdAt: todaysDate,
					createdBy: 'me',
					updatedAt: null,
					updatedBy: null,
				},
			];

			const response = groupSchemaDataByEntityName({ inserts: newData, submittedData });
			expect(Object.keys(response).length).to.eq(2);
			expect(response.submittedDataByEntityName['cars'].length).to.eql(2);
			expect(response.schemaDataByEntityName['cars']).to.eql([
				{
					name: 'Bugatti La Voiture Noire',
				},
				{
					name: 'Lamborghini Revuelto',
				},
			]);
		});
	});
	describe('Finds an error by index', () => {
		const listOfErrors: SchemaRecordError<DictionaryValidationRecordErrorDetails>[] = [
			{
				recordIndex: 1,
				recordErrors: [
					{
						reason: 'UNRECOGNIZED_FIELD',
						fieldName: 'systemId',
						fieldValue: '',
					},
				],
			},
			{
				recordIndex: 1,
				recordErrors: [
					{
						errors: [],
						reason: `INVALID_BY_RESTRICTION`,
						fieldName: 'sex_at_birth',
						fieldValue: 'Homme',
					},
				],
			},
		];
		it('should return true if error is found on index', () => {
			const errorsByIndex = groupErrorsByIndex(listOfErrors);
			const response = hasErrorsByIndex(errorsByIndex, 1);
			expect(response).to.be.true;
		});
		it('should return false if no error is found on index', () => {
			const errorsByIndex = groupErrorsByIndex(listOfErrors);
			const response = hasErrorsByIndex(errorsByIndex, 0);
			expect(response).to.be.false;
		});
	});
	describe('Transforms SubmittedData objects into a Record grouped by entityName', () => {
		it('should return an empty object when no SubmittedData is passed', () => {
			const response = transformmSubmittedDataToSubmissionDeleteData([]);
			expect(Object.keys(response).length).to.eq(0);
		});
		it('should return an object groupd by entity name', () => {
			const submittedDataList: SubmittedData[] = [
				{
					id: 1,
					data: {
						name: 'Lamborghini Revuelto',
					},
					dictionaryCategoryId: 1,
					entityName: 'cars',
					isValid: true,
					lastValidSchemaId: 1,
					organization: 'mycollection',
					originalSchemaId: 1,
					systemId: 'ABC123',
					createdAt: todaysDate,
					createdBy: 'me',
					updatedAt: null,
					updatedBy: null,
				},
				{
					id: 2,
					data: {
						name: 'Bugatti La Voiture Noire',
					},
					dictionaryCategoryId: 1,
					entityName: 'cars',
					isValid: true,
					lastValidSchemaId: 1,
					organization: 'mycollection',
					originalSchemaId: 1,
					systemId: 'XYZ456',
					createdAt: todaysDate,
					createdBy: 'me',
					updatedAt: null,
					updatedBy: null,
				},
			];
			const response = transformmSubmittedDataToSubmissionDeleteData(submittedDataList);
			expect(Object.keys(response)).to.eql(['cars']);
			expect(response['cars'].length).to.eq(2);
			expect(response['cars']).to.eql([
				{
					data: {
						name: 'Lamborghini Revuelto',
					},
					entityName: 'cars',
					isValid: true,
					organization: 'mycollection',
					systemId: 'ABC123',
				},
				{
					data: {
						name: 'Bugatti La Voiture Noire',
					},
					entityName: 'cars',
					isValid: true,
					organization: 'mycollection',
					systemId: 'XYZ456',
				},
			]);
		});
	});
});
