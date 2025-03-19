import { expect } from 'chai';
import { describe, it } from 'mocha';

import { type DictionaryValidationRecordErrorDetails, type SchemaRecordError } from '@overture-stack/lectern-client';

import { groupErrorsByIndex } from '../../../src/utils/submittedDataUtils.js';

describe('Submitted Data Utils - groupErrorsByIndex', () => {
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
});
