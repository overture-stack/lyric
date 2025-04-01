import { expect } from 'chai';
import { describe, it } from 'mocha';

import { type DictionaryValidationRecordErrorDetails, type SchemaRecordError } from '@overture-stack/lectern-client';

import { groupErrorsByIndex, hasErrorsByIndex } from '../../../src/utils/submittedDataUtils.js';

describe('Submitted Data Utils - hasErrorsByIndex', () => {
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
			expect(response).to.eql(true);
		});
		it('should return false if no error is found on index', () => {
			const errorsByIndex = groupErrorsByIndex(listOfErrors);
			const response = hasErrorsByIndex(errorsByIndex, 0);
			expect(response).to.eql(false);
		});
	});
});
