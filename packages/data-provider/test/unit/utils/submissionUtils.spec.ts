import { expect } from 'chai';
import { describe, it } from 'mocha';

import type { SubmissionRecordError } from '@overture-stack/lyric-data-model/models';

import type { SubmissionRecordFieldError } from '../../../src/utils/submissionTypes.js';
import {
	formatFieldErrorsAsDelimitedText,
	groupFieldErrorsByFieldAndReason,
	mapSubmissionRecordErrorsToFieldErrors,
	pluralizeSchemaName,
} from '../../../src/utils/submissionUtils.js';

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
			expect(mapSubmissionRecordErrorsToFieldErrors(null, 1)).to.deep.equal([]);
			expect(mapSubmissionRecordErrorsToFieldErrors(undefined, 1)).to.deep.equal([]);
		});

		it('maps a field-scoped error to fieldName, fieldValue, reason, rowNumber, and a generated message', () => {
			const errors: SubmissionRecordError[] = [
				{ reason: 'UNRECOGNIZED_FIELD', fieldName: 'donor_id', fieldValue: 'DO1' },
			];

			expect(mapSubmissionRecordErrorsToFieldErrors(errors, 42)).to.deep.equal([
				{
					rowNumber: 42,
					fieldName: 'donor_id',
					fieldValue: 'DO1',
					reason: 'UNRECOGNIZED_FIELD',
					message: `Field 'donor_id' is not recognized in the schema`,
				},
			]);
		});

		it('omits rowNumber when the record has no line number (e.g. not sourced from a file)', () => {
			const errors: SubmissionRecordError[] = [
				{ reason: 'UNRECOGNIZED_FIELD', fieldName: 'donor_id', fieldValue: 'DO1' },
			];

			expect(mapSubmissionRecordErrorsToFieldErrors(errors, null)).to.deep.equal([
				{
					rowNumber: undefined,
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

			expect(mapSubmissionRecordErrorsToFieldErrors(errors, 42)).to.deep.equal([
				{
					rowNumber: 42,
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

			expect(mapSubmissionRecordErrorsToFieldErrors(errors, 42)).to.deep.equal([
				{
					rowNumber: 42,
					reason: 'CONFLICTING_ACTION',
					message: `Record with systemId 'abc-123' has both an UPDATE and a DELETE staged`,
				},
			]);
		});

		it('expands one INVALID_BY_RESTRICTION error into one entry per failed restriction, carrying each restrictionType and the rowNumber', () => {
			const errors: SubmissionRecordError[] = [
				{
					reason: 'INVALID_BY_RESTRICTION',
					fieldName: 'age_at_diagnosis',
					fieldValue: -5,
					errors: [
						{
							message: 'A value is required for this field.',
							restriction: { type: 'required', rule: true },
						},
						{
							message: 'The value must be within the range.',
							restriction: { type: 'range', rule: { min: 0 } },
						},
					],
				},
			];

			expect(mapSubmissionRecordErrorsToFieldErrors(errors, 42)).to.deep.equal([
				{
					rowNumber: 42,
					fieldName: 'age_at_diagnosis',
					fieldValue: -5,
					reason: 'INVALID_BY_RESTRICTION',
					restrictionType: 'required',
					message: 'A value is required for this field.',
				},
				{
					rowNumber: 42,
					fieldName: 'age_at_diagnosis',
					fieldValue: -5,
					reason: 'INVALID_BY_RESTRICTION',
					restrictionType: 'range',
					message: 'The value must be within the range.',
				},
			]);
		});
	});

	describe('groupFieldErrorsByFieldAndReason', () => {
		it('returns an empty array for no errors', () => {
			expect(groupFieldErrorsByFieldAndReason([])).to.deep.equal([]);
		});

		it('counts repeated errors sharing the same fieldName and reason as one group, keeping the first message and every rowNumber', () => {
			const fieldErrors: SubmissionRecordFieldError[] = [
				{ rowNumber: 1, fieldName: 'donor_id', reason: 'UNRECOGNIZED_FIELD', message: 'a' },
				{ rowNumber: 2, fieldName: 'donor_id', reason: 'UNRECOGNIZED_FIELD', message: 'b' },
				{ rowNumber: 3, fieldName: 'donor_id', reason: 'UNRECOGNIZED_FIELD', message: 'c' },
			];

			expect(groupFieldErrorsByFieldAndReason(fieldErrors)).to.deep.equal([
				{
					fieldName: 'donor_id',
					reason: 'UNRECOGNIZED_FIELD',
					restrictionType: undefined,
					message: 'a',
					count: 3,
					rowNumbers: [1, 2, 3],
				},
			]);
		});

		it('deduplicates rowNumbers when the same record contributes more than one error to a group', () => {
			const fieldErrors: SubmissionRecordFieldError[] = [
				{ rowNumber: 5, fieldName: 'donor_id', reason: 'UNRECOGNIZED_FIELD', message: 'a' },
				{ rowNumber: 5, fieldName: 'donor_id', reason: 'UNRECOGNIZED_FIELD', message: 'a' },
			];

			expect(groupFieldErrorsByFieldAndReason(fieldErrors)).to.deep.equal([
				{
					fieldName: 'donor_id',
					reason: 'UNRECOGNIZED_FIELD',
					restrictionType: undefined,
					message: 'a',
					count: 2,
					rowNumbers: [5],
				},
			]);
		});

		it('sorts rowNumbers ascending regardless of input order', () => {
			const fieldErrors: SubmissionRecordFieldError[] = [
				{ rowNumber: 9, fieldName: 'donor_id', reason: 'UNRECOGNIZED_FIELD', message: 'a' },
				{ rowNumber: 2, fieldName: 'donor_id', reason: 'UNRECOGNIZED_FIELD', message: 'a' },
				{ rowNumber: 5, fieldName: 'donor_id', reason: 'UNRECOGNIZED_FIELD', message: 'a' },
			];

			expect(groupFieldErrorsByFieldAndReason(fieldErrors)[0]?.rowNumbers).to.deep.equal([2, 5, 9]);
		});

		it('counts a record with no rowNumber toward count, without adding an entry to rowNumbers', () => {
			const fieldErrors: SubmissionRecordFieldError[] = [
				{ rowNumber: 1, fieldName: 'donor_id', reason: 'UNRECOGNIZED_FIELD', message: 'a' },
				{ fieldName: 'donor_id', reason: 'UNRECOGNIZED_FIELD', message: 'a' },
			];

			expect(groupFieldErrorsByFieldAndReason(fieldErrors)).to.deep.equal([
				{
					fieldName: 'donor_id',
					reason: 'UNRECOGNIZED_FIELD',
					restrictionType: undefined,
					message: 'a',
					count: 2,
					rowNumbers: [1],
				},
			]);
		});

		it('keeps the same fieldName with different reasons as separate groups', () => {
			const fieldErrors: SubmissionRecordFieldError[] = [
				{ rowNumber: 1, fieldName: 'age_at_diagnosis', reason: 'INVALID_BY_UNIQUE', message: 'a' },
				{ rowNumber: 2, fieldName: 'age_at_diagnosis', reason: 'INVALID_VALUE_TYPE', message: 'b' },
			];

			expect(groupFieldErrorsByFieldAndReason(fieldErrors)).to.deep.equal([
				{
					fieldName: 'age_at_diagnosis',
					reason: 'INVALID_BY_UNIQUE',
					restrictionType: undefined,
					message: 'a',
					count: 1,
					rowNumbers: [1],
				},
				{
					fieldName: 'age_at_diagnosis',
					reason: 'INVALID_VALUE_TYPE',
					restrictionType: undefined,
					message: 'b',
					count: 1,
					rowNumbers: [2],
				},
			]);
		});

		it('groups errors with no fieldName (e.g. CONFLICTING_ACTION) together, separately from field-scoped ones', () => {
			const fieldErrors: SubmissionRecordFieldError[] = [
				{ rowNumber: 1, reason: 'CONFLICTING_ACTION', message: 'a' },
				{ rowNumber: 2, reason: 'CONFLICTING_ACTION', message: 'b' },
				{ rowNumber: 3, fieldName: 'donor_id', reason: 'UNRECOGNIZED_FIELD', message: 'c' },
			];

			expect(groupFieldErrorsByFieldAndReason(fieldErrors)).to.deep.equal([
				{
					fieldName: undefined,
					reason: 'CONFLICTING_ACTION',
					restrictionType: undefined,
					message: 'a',
					count: 2,
					rowNumbers: [1, 2],
				},
				{
					fieldName: 'donor_id',
					reason: 'UNRECOGNIZED_FIELD',
					restrictionType: undefined,
					message: 'c',
					count: 1,
					rowNumbers: [3],
				},
			]);
		});

		it('splits INVALID_BY_RESTRICTION errors on the same field into separate groups by restrictionType', () => {
			const fieldErrors: SubmissionRecordFieldError[] = [
				{
					rowNumber: 1,
					fieldName: 'age_at_diagnosis',
					reason: 'INVALID_BY_RESTRICTION',
					restrictionType: 'required',
					message: 'A value is required for this field.',
				},
				{
					rowNumber: 2,
					fieldName: 'age_at_diagnosis',
					reason: 'INVALID_BY_RESTRICTION',
					restrictionType: 'range',
					message: 'The value must be within the range.',
				},
				{
					rowNumber: 3,
					fieldName: 'age_at_diagnosis',
					reason: 'INVALID_BY_RESTRICTION',
					restrictionType: 'required',
					message: 'A value is required for this field.',
				},
			];

			expect(groupFieldErrorsByFieldAndReason(fieldErrors)).to.deep.equal([
				{
					fieldName: 'age_at_diagnosis',
					reason: 'INVALID_BY_RESTRICTION',
					restrictionType: 'required',
					message: 'A value is required for this field.',
					count: 2,
					rowNumbers: [1, 3],
				},
				{
					fieldName: 'age_at_diagnosis',
					reason: 'INVALID_BY_RESTRICTION',
					restrictionType: 'range',
					message: 'The value must be within the range.',
					count: 1,
					rowNumbers: [2],
				},
			]);
		});
	});

	describe('formatFieldErrorsAsDelimitedText', () => {
		it('writes a header row and one row per error, comma-delimited, leading with rowNumber', () => {
			const fieldErrors: SubmissionRecordFieldError[] = [
				{
					rowNumber: 5,
					fieldName: 'donor_id',
					fieldValue: 'DO1',
					reason: 'UNRECOGNIZED_FIELD',
					message: 'not recognized',
				},
			];

			expect(formatFieldErrorsAsDelimitedText(fieldErrors, ',')).to.equal(
				'rowNumber,fieldName,reason,fieldValue,message\n5,donor_id,UNRECOGNIZED_FIELD,DO1,not recognized\n',
			);
		});

		it('tab-delimits when given a tab delimiter', () => {
			const fieldErrors: SubmissionRecordFieldError[] = [
				{
					rowNumber: 5,
					fieldName: 'donor_id',
					fieldValue: 'DO1',
					reason: 'UNRECOGNIZED_FIELD',
					message: 'not recognized',
				},
			];

			expect(formatFieldErrorsAsDelimitedText(fieldErrors, '\t')).to.equal(
				'rowNumber\tfieldName\treason\tfieldValue\tmessage\n5\tdonor_id\tUNRECOGNIZED_FIELD\tDO1\tnot recognized\n',
			);
		});

		it('quotes a value containing the delimiter, and joins an array fieldValue with "; " unquoted', () => {
			const fieldErrors: SubmissionRecordFieldError[] = [
				{
					rowNumber: 5,
					fieldName: 'notes',
					fieldValue: ['a', 'b'],
					reason: 'UNRECOGNIZED_VALUE',
					message: 'contains, a comma',
				},
			];

			expect(formatFieldErrorsAsDelimitedText(fieldErrors, ',')).to.equal(
				'rowNumber,fieldName,reason,fieldValue,message\n5,notes,UNRECOGNIZED_VALUE,a; b,"contains, a comma"\n',
			);
		});

		it('writes an empty string for a missing fieldName or a missing rowNumber', () => {
			const fieldErrors: SubmissionRecordFieldError[] = [{ reason: 'CONFLICTING_ACTION', message: 'conflict' }];

			expect(formatFieldErrorsAsDelimitedText(fieldErrors, ',')).to.equal(
				'rowNumber,fieldName,reason,fieldValue,message\n,,CONFLICTING_ACTION,,conflict\n',
			);
		});
	});
});
