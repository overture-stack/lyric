import { expect } from 'chai';
import { describe, it } from 'mocha';

import type { DictionaryValidationError, TestResult } from '@overture-stack/lectern-client';

import { groupSchemaErrorsByEntity } from '../../../src/utils/submissionUtils.js';
import { type DataRecordReference, MERGE_REFERENCE_TYPE } from '../../../src/utils/types.js';

describe('Submission Utils - Group validation errors by entity', () => {
	it('retuns empty object when there is no data being processed', () => {
		const resultValidation: TestResult<DictionaryValidationError[]> = {
			valid: false,
			details: [],
		};
		const dataValidated: Record<string, DataRecordReference[]> = {};

		const response = groupSchemaErrorsByEntity({ resultValidation, dataValidated });
		expect(response).to.eql({});
	});
	it('retuns empty object when no there no errors on Submission', () => {
		const resultValidation: TestResult<DictionaryValidationError[]> = {
			valid: false,
			details: [],
		};
		const dataValidated: Record<string, DataRecordReference[]> = {
			sports: [
				{
					dataRecord: { title: 'ABC' },
					reference: {
						systemId: 'ABC890',
						submittedDataId: 9,
						type: MERGE_REFERENCE_TYPE.SUBMITTED_DATA,
					},
				},
				{
					dataRecord: { title: 'XYZ' },
					reference: {
						systemId: 'XYZ890',
						submittedDataId: 10,
						type: MERGE_REFERENCE_TYPE.SUBMITTED_DATA,
					},
				},
			],
		};

		const response = groupSchemaErrorsByEntity({ resultValidation, dataValidated });
		expect(response).to.eql({});
	});
	it('retuns errors found on the Submission new inserts', () => {
		const resultValidation: TestResult<DictionaryValidationError[]> = {
			valid: false,
			details: [
				{
					schemaName: 'sports',
					reason: 'INVALID_RECORDS',
					invalidRecords: [
						{
							recordIndex: 0,
							recordErrors: [{ fieldName: 'systemId', reason: 'UNRECOGNIZED_FIELD', fieldValue: '' }],
						},
						{
							recordIndex: 1,
							recordErrors: [{ fieldName: 'sex_at_birth', reason: 'UNRECOGNIZED_FIELD', fieldValue: 'Homme' }],
						},
					],
				},
			],
		};
		const dataValidated: Record<string, DataRecordReference[]> = {
			sports: [
				{
					dataRecord: { title: 'XYZ123' },
					reference: {
						index: 12,
						submissionId: 23,
						type: MERGE_REFERENCE_TYPE.NEW_SUBMITTED_DATA,
					},
				},
				{
					dataRecord: { sex_at_birth: 'Homme' },
					reference: {
						index: 12,
						submissionId: 23,
						type: MERGE_REFERENCE_TYPE.NEW_SUBMITTED_DATA,
					},
				},
			],
		};

		const response = groupSchemaErrorsByEntity({ resultValidation, dataValidated });
		expect(Object.keys(response)).to.eql(['inserts']);
		expect(Object.keys(response['inserts'])).to.eql(['sports']);
		expect(response['inserts']['sports'].length).to.eq(2);
		expect(response['inserts']['sports']).to.eql([
			{ fieldName: 'systemId', reason: 'UNRECOGNIZED_FIELD', fieldValue: '', index: 12 },
			{ fieldName: 'sex_at_birth', reason: 'UNRECOGNIZED_FIELD', fieldValue: 'Homme', index: 12 },
		]);
	});
	it('retuns errors found on the Submission updates', () => {
		const resultValidation: TestResult<DictionaryValidationError[]> = {
			valid: false,
			details: [
				{
					schemaName: 'sports',
					reason: 'INVALID_RECORDS',
					invalidRecords: [
						{
							recordIndex: 0,
							recordErrors: [{ fieldName: 'systemId', reason: 'INVALID_BY_RESTRICTION', fieldValue: '', errors: [] }],
						},
						{
							recordIndex: 1,
							recordErrors: [
								{ fieldName: 'sex_at_birth', reason: 'INVALID_BY_RESTRICTION', fieldValue: '', errors: [] },
							],
						},
					],
				},
			],
		};
		const dataValidated: Record<string, DataRecordReference[]> = {
			sports: [
				{
					dataRecord: { title: 'XYZ123' },
					reference: {
						index: 12,
						submissionId: 23,
						type: MERGE_REFERENCE_TYPE.EDIT_SUBMITTED_DATA,
					},
				},
				{
					dataRecord: { sex_at_birth: 'Homme' },
					reference: {
						index: 12,
						submissionId: 23,
						type: MERGE_REFERENCE_TYPE.EDIT_SUBMITTED_DATA,
					},
				},
			],
		};

		const response = groupSchemaErrorsByEntity({ resultValidation, dataValidated });
		expect(Object.keys(response)).to.eql(['updates']);
		expect(Object.keys(response['updates'])).to.eql(['sports']);
		expect(response['updates']['sports'].length).to.eq(2);
		expect(response['updates']['sports']).to.eql([
			{
				errors: [],
				index: 12,
				reason: 'INVALID_BY_RESTRICTION',
				fieldName: 'systemId',
				fieldValue: '',
			},
			{
				errors: [],
				index: 12,
				reason: 'INVALID_BY_RESTRICTION',
				fieldName: 'sex_at_birth',
				fieldValue: '',
			},
		]);
	});
});
