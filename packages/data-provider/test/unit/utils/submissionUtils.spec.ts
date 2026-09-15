import { expect } from 'chai';
import { describe, it } from 'mocha';

import type { SubmissionRecordError } from '@overture-stack/lyric-data-model/models';

import { mapSubmissionRecordErrorsToFieldErrors, pluralizeSchemaName } from '../../../src/utils/submissionUtils.js';

describe('Submission Utils', () => {
	describe('pluralizeSchemaName', () => {
		it('pluralizes a regular schema name', () => {
			expect(pluralizeSchemaName('donor')).to.equal('donors');
		});

		it('pluralizes a schema name ending in a consonant + y', () => {
			expect(pluralizeSchemaName('family_history')).to.equal('family_histories');
		});

		it('pluralizes a schema name ending in a Latin -is, not just appending s', () => {
			expect(pluralizeSchemaName('primary_diagnosis')).to.equal('primary_diagnoses');
		});

		it('pluralizes a schema name that a naive uncountable-noun list would leave unchanged', () => {
			expect(pluralizeSchemaName('specimen')).to.equal('specimens');
		});
	});

	describe('mapSubmissionRecordErrorsToFieldErrors', () => {
		it('returns an empty array for null or undefined errors', () => {
			expect(mapSubmissionRecordErrorsToFieldErrors(null)).to.deep.equal([]);
			expect(mapSubmissionRecordErrorsToFieldErrors(undefined)).to.deep.equal([]);
		});

		it('maps a field-scoped error to fieldName, fieldValue, reason, and a generated message', () => {
			const errors: SubmissionRecordError[] = [
				{ reason: 'UNRECOGNIZED_FIELD', fieldName: 'donor_id', fieldValue: 'DO1' },
			];

			expect(mapSubmissionRecordErrorsToFieldErrors(errors)).to.deep.equal([
				{
					fieldName: 'donor_id',
					fieldValue: 'DO1',
					reason: 'UNRECOGNIZED_FIELD',
					message: `Field 'donor_id' is not recognized in the schema`,
				},
			]);
		});

		it('omits fieldName and fieldValue for a record-scoped error with no single field', () => {
			const errors: SubmissionRecordError[] = [
				{
					reason: 'INVALID_BY_UNIQUE_KEY',
					uniqueKey: { donor_id: 'DO1', specimen_id: 'SP1' },
					matchingRecords: [3],
				},
			];

			expect(mapSubmissionRecordErrorsToFieldErrors(errors)).to.deep.equal([
				{
					reason: 'INVALID_BY_UNIQUE_KEY',
					message: `Unique key '{"donor_id":"DO1","specimen_id":"SP1"}' conflicts with record(s) '3'`,
				},
			]);
		});

		it('preserves an already-provided message for a conflicting-action error', () => {
			const errors: SubmissionRecordError[] = [
				{
					reason: 'CONFLICTING_ACTION',
					systemId: 'abc-123',
					conflictingActionType: 'DELETE',
					message: `Record with systemId 'abc-123' has both an UPDATE and a DELETE staged`,
				},
			];

			expect(mapSubmissionRecordErrorsToFieldErrors(errors)).to.deep.equal([
				{
					reason: 'CONFLICTING_ACTION',
					message: `Record with systemId 'abc-123' has both an UPDATE and a DELETE staged`,
				},
			]);
		});

		it('expands one INVALID_BY_RESTRICTION error into one entry per failed restriction', () => {
			const errors: SubmissionRecordError[] = [
				{
					reason: 'INVALID_BY_RESTRICTION',
					fieldName: 'age_at_diagnosis',
					fieldValue: -5,
					errors: [
						{
							message: 'Value must be greater than or equal to 0',
							restriction: { type: 'required', rule: true },
						},
						{ message: 'Value must be an integer', restriction: { type: 'required', rule: true } },
					],
				},
			];

			expect(mapSubmissionRecordErrorsToFieldErrors(errors)).to.deep.equal([
				{
					fieldName: 'age_at_diagnosis',
					fieldValue: -5,
					reason: 'INVALID_BY_RESTRICTION',
					message: 'Value must be greater than or equal to 0',
				},
				{
					fieldName: 'age_at_diagnosis',
					fieldValue: -5,
					reason: 'INVALID_BY_RESTRICTION',
					message: 'Value must be an integer',
				},
			]);
		});
	});
});
