import { expect } from 'chai';
import { describe, it } from 'mocha';

import { DictionaryValidationError, TestResult, type TestResultValid } from '@overture-stack/lectern-client';

import { findInvalidRecordErrorsBySchemaName } from '../../../src/utils/submissionUtils.js';

describe('Submission Utils - Returns invalid recods', () => {
	it('should return invalid records by entity name', () => {
		const results: TestResult<DictionaryValidationError[]> = {
			valid: false,
			details: [
				{
					schemaName: 'sport',
					reason: 'INVALID_RECORDS',
					invalidRecords: [
						{
							recordErrors: [
								{
									fieldName: 'sport_id',
									fieldValue: 1,
									isArray: false,
									reason: 'INVALID_VALUE_TYPE',
									valueType: 'string',
								},
							],
							recordIndex: 0,
						},
					],
				},
			],
		};

		const result = findInvalidRecordErrorsBySchemaName(results, 'sport');
		expect(result.length).to.eql(1);
	});

	it('should return empty array if there are no errors in the entityName', () => {
		const results: TestResult<DictionaryValidationError[]> = {
			valid: false,
			details: [
				{
					schemaName: 'sport',
					reason: 'INVALID_RECORDS',
					invalidRecords: [
						{
							recordErrors: [
								{
									fieldName: 'sport_id',
									fieldValue: 1,
									isArray: false,
									reason: 'INVALID_VALUE_TYPE',
									valueType: 'string',
								},
							],
							recordIndex: 0,
						},
					],
				},
			],
		};

		const result = findInvalidRecordErrorsBySchemaName(results, 'cars');
		expect(result.length).to.eql(0);
	});

	it('should return empty array if result object is valid', () => {
		const results: TestResult<TestResultValid[]> = {
			valid: true,
		};

		const result = findInvalidRecordErrorsBySchemaName(results, 'sports');
		expect(result.length).to.eql(0);
	});
});
