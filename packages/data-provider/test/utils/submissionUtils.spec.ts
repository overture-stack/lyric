import { expect } from 'chai';
import { describe, it } from 'mocha';

import type {
	Submission,
	SubmissionData,
	SubmissionDeleteData,
	SubmissionInsertData,
	SubmissionUpdateData,
	SubmittedData,
} from '@overture-stack/lyric-data-model';
import {
	BatchProcessingResult,
	type DataRecord,
	SchemaValidationErrorTypes,
} from '@overturebio-stack/lectern-client/lib/schema-entities.js';

import type { SchemaChildNode } from '../../src/utils/dictionarySchemaRelations.js';
import {
	canTransitionToClosed,
	determineIfIsSubmission,
	extractSchemaDataFromMergedDataRecords,
	filterDeletesFromUpdates,
	filterRelationsForPrimaryIdUpdate,
	filterUpdatesFromDeletes,
	groupSchemaErrorsByEntity,
	mapGroupedUpdateSubmissionData,
	mapInsertDataToRecordReferences,
	mergeAndReferenceEntityData,
	mergeDeleteRecords,
	mergeInsertsRecords,
	mergeRecords,
	mergeUpdatesBySystemId,
	parseActiveSubmissionResponse,
	parseActiveSubmissionSummaryResponse,
	removeItemsFromSubmission,
	segregateFieldChangeRecords,
} from '../../src/utils/submissionUtils.js';
import {
	type ActiveSubmissionSummaryRepository,
	type DataRecordReference,
	type EditSubmittedDataReference,
	MERGE_REFERENCE_TYPE,
	type NewSubmittedDataReference,
	SUBMISSION_ACTION_TYPE,
	SUBMISSION_STATUS,
	type SubmissionActionType,
	type SubmittedDataReference,
} from '../../src/utils/types.js';

describe('Submission Utils', () => {
	const todaysDate = new Date();
	describe('Determine if a Submission is on the right status to be closed', () => {
		it('should return true if a Submission status is OPEN', () => {
			const response = canTransitionToClosed('OPEN');
			expect(response).to.be.true;
		});
		it('should return true if a Submission status is VALID', () => {
			const response = canTransitionToClosed('VALID');
			expect(response).to.be.true;
		});
		it('should return true if a Submission status is INVALID', () => {
			const response = canTransitionToClosed('INVALID');
			expect(response).to.be.true;
		});
		it('should return false if a Submission status is CLOSED', () => {
			const response = canTransitionToClosed('CLOSED');
			expect(response).to.be.false;
		});
		it('should return false if a Submission status is COMMITTED', () => {
			const response = canTransitionToClosed('COMMITTED');
			expect(response).to.be.false;
		});
	});
	describe('Determine if processing object is a Submission or Submitted Data', () => {
		it('should return false if it is a SubmittedData referenced object', () => {
			const input: SubmittedDataReference = {
				submittedDataId: 1,
				type: MERGE_REFERENCE_TYPE.SUBMITTED_DATA,
				systemId: 'SBMT1234',
			};
			const response = determineIfIsSubmission(input);
			expect(response).to.be.false;
		});
		it('should return true if it is an insert on a Submission referenced object', () => {
			const input: NewSubmittedDataReference = {
				index: 1,
				submissionId: 1,
				type: MERGE_REFERENCE_TYPE.NEW_SUBMITTED_DATA,
			};
			const response = determineIfIsSubmission(input);
			expect(response).to.be.true;
		});
		it('should return true if it is an update on a Submission referenced object', () => {
			const input: EditSubmittedDataReference = {
				index: 1,
				submissionId: 1,
				type: MERGE_REFERENCE_TYPE.EDIT_SUBMITTED_DATA,
				systemId: 'EDT432',
			};
			const response = determineIfIsSubmission(input);
			expect(response).to.be.true;
		});
	});
	describe('Extracts SchemaData from DataRecordReference Record', () => {
		it('should process a Record with mixed SubmittedData and Submission References', () => {
			const insertSubmissionReference: DataRecordReference = {
				dataRecord: { title: 'abc' },
				reference: {
					index: 12,
					submissionId: 23,
					type: MERGE_REFERENCE_TYPE.NEW_SUBMITTED_DATA,
				},
			};
			const SubmittedDataReference: DataRecordReference = {
				dataRecord: { title: 'xyz' },
				reference: {
					submittedDataId: 10,
					type: MERGE_REFERENCE_TYPE.SUBMITTED_DATA,
					systemId: 'ABN1238',
				},
			};
			const input: Record<string, DataRecordReference[]> = {
				cars: [insertSubmissionReference, SubmittedDataReference],
			};
			const response = extractSchemaDataFromMergedDataRecords(input);
			expect(Object.keys(response)).to.eql(['cars']);
			expect(response['cars'].length).to.eq(2);
			expect(response['cars']).to.eql([{ title: 'abc' }, { title: 'xyz' }]);
		});
		it('should return empty a Record with an empty array of References', () => {
			const input: Record<string, DataRecordReference[]> = { cars: [] };
			const response = extractSchemaDataFromMergedDataRecords(input);
			expect(Object.keys(response)).to.eql(['cars']);
			expect(response['cars'].length).to.eq(0);
			expect(response['cars']).to.eql([]);
		});
		it('should return empty Record when input is an emtpy object', () => {
			const response = extractSchemaDataFromMergedDataRecords({});
			expect(Object.keys(response).length).to.eq(0);
			expect(Object.keys(response)).to.eql([]);
		});
	});
	describe('Remove conflicts on Submission with records to be delete', () => {
		it('should remove 1 matching record from the Delete records', () => {
			const submissionDeleteData: Record<string, SubmissionDeleteData[]> = {
				cars: [
					{
						systemId: 'AAA111',
						data: { name: 'Lambo' },
						entityName: 'cars',
						isValid: true,
						organization: 'myCollection',
					},
					{
						systemId: 'BBB222',
						data: { name: 'Beettle' },
						entityName: 'cars',
						isValid: true,
						organization: 'myCollection',
					},
				],
			};

			const submissionUpdateData: Record<string, SubmissionUpdateData[]> = {
				cars: [{ systemId: 'AAA111', new: { name: 'lamborghini' }, old: { name: 'Lambo' } }],
			};
			const result = filterDeletesFromUpdates(submissionDeleteData, submissionUpdateData);
			expect(Object.keys(result)).to.eql(['cars']);
			expect(result['cars'].length).to.eq(1);
			expect(result['cars'][0]).to.eql({
				systemId: 'BBB222',
				data: { name: 'Beettle' },
				entityName: 'cars',
				isValid: true,
				organization: 'myCollection',
			});
		});
		it('should not remove any record if there is no matching Id', () => {
			const submissionDeleteData: Record<string, SubmissionDeleteData[]> = {
				cars: [
					{
						systemId: 'AAA111',
						data: { name: 'Lambo' },
						entityName: 'cars',
						isValid: true,
						organization: 'myCollection',
					},
					{
						systemId: 'BBB222',
						data: { name: 'Beettle' },
						entityName: 'cars',
						isValid: true,
						organization: 'myCollection',
					},
				],
			};

			const submissionUpdateData: Record<string, SubmissionUpdateData[]> = {
				cars: [{ systemId: 'CCC333', new: { name: 'Volkswagen' }, old: { name: 'VW' } }],
			};
			const result = filterDeletesFromUpdates(submissionDeleteData, submissionUpdateData);
			expect(Object.keys(result)).to.eql(['cars']);
			expect(result['cars'].length).to.eq(2);
			expect(result['cars']).to.eql([
				{
					systemId: 'AAA111',
					data: { name: 'Lambo' },
					entityName: 'cars',
					isValid: true,
					organization: 'myCollection',
				},
				{
					systemId: 'BBB222',
					data: { name: 'Beettle' },
					entityName: 'cars',
					isValid: true,
					organization: 'myCollection',
				},
			]);
		});
		it('should not remove any record if there is no matching entity name', () => {
			const submissionDeleteData: Record<string, SubmissionDeleteData[]> = {
				cars: [
					{
						systemId: 'AAA111',
						data: { name: 'Lambo' },
						entityName: 'cars',
						isValid: true,
						organization: 'myCollection',
					},
					{
						systemId: 'BBB222',
						data: { name: 'Beettle' },
						entityName: 'cars',
						isValid: true,
						organization: 'myCollection',
					},
				],
			};

			const submissionUpdateData: Record<string, SubmissionUpdateData[]> = {
				food: [{ systemId: 'PTT123', new: { name: 'Potato' }, old: { name: 'Tomato' } }],
			};
			const result = filterDeletesFromUpdates(submissionDeleteData, submissionUpdateData);
			expect(Object.keys(result)).to.eql(['cars']);
			expect(result['cars'].length).to.eq(2);
			expect(result['cars']).to.eql([
				{
					systemId: 'AAA111',
					data: { name: 'Lambo' },
					entityName: 'cars',
					isValid: true,
					organization: 'myCollection',
				},
				{
					systemId: 'BBB222',
					data: { name: 'Beettle' },
					entityName: 'cars',
					isValid: true,
					organization: 'myCollection',
				},
			]);
		});
		it('should return empty object when passing an empty object', () => {
			const submissionUpdateData: Record<string, SubmissionUpdateData[]> = {
				cars: [{ systemId: 'CCC333', new: { name: 'Volkswagen' }, old: { name: 'VW' } }],
			};
			const result = filterDeletesFromUpdates({}, submissionUpdateData);
			expect(Object.keys(result).length).to.eq(0);
		});
	});
	describe('Remove conflicts on Submission with records to be updated', () => {
		it('should remove 1 matching record from the updates records', () => {
			const submissionUpdateData: Record<string, SubmissionUpdateData[]> = {
				cars: [
					{ systemId: 'AAA111', new: { name: 'lamborghini Huracan' }, old: { name: 'Lambo' } },
					{ systemId: 'BBB222', new: { name: 'Volkswagen Beettle' }, old: { name: 'Beettle' } },
				],
			};

			const submissionDeleteData: Record<string, SubmissionDeleteData[]> = {
				cars: [
					{
						systemId: 'AAA111',
						data: { name: 'Lambo' },
						entityName: 'cars',
						isValid: true,
						organization: 'myCollection',
					},
				],
			};
			const result = filterUpdatesFromDeletes(submissionUpdateData, submissionDeleteData);
			expect(Object.keys(result)).to.eql(['cars']);
			expect(result['cars'].length).to.eq(1);
			expect(result['cars'][0]).to.eql({
				systemId: 'BBB222',
				new: { name: 'Volkswagen Beettle' },
				old: { name: 'Beettle' },
			});
		});
		it('should not remove any record if there is no matching Id', () => {
			const submissionUpdateData: Record<string, SubmissionUpdateData[]> = {
				cars: [
					{ systemId: 'CCC333', new: { name: 'Volkswagen' }, old: { name: 'VW' } },
					{ systemId: 'DDDD444', new: { name: 'Audi' }, old: { name: 'Q5' } },
				],
			};

			const submissionDeleteData: Record<string, SubmissionDeleteData[]> = {
				cars: [
					{
						systemId: 'AAA111',
						data: { name: 'Lambo' },
						entityName: 'cars',
						isValid: true,
						organization: 'myCollection',
					},
					{
						systemId: 'BBB222',
						data: { name: 'Beettle' },
						entityName: 'cars',
						isValid: true,
						organization: 'myCollection',
					},
				],
			};

			const result = filterUpdatesFromDeletes(submissionUpdateData, submissionDeleteData);
			expect(Object.keys(result)).to.eql(['cars']);
			expect(result['cars'].length).to.eq(2);
			expect(result['cars']).to.eql([
				{ systemId: 'CCC333', new: { name: 'Volkswagen' }, old: { name: 'VW' } },
				{ systemId: 'DDDD444', new: { name: 'Audi' }, old: { name: 'Q5' } },
			]);
		});
		it('should not remove any record if there is no matching entity name', () => {
			const submissionUpdateData: Record<string, SubmissionUpdateData[]> = {
				food: [
					{ systemId: 'PTT123', new: { name: 'Potato' }, old: { name: 'Tomato' } },
					{ systemId: 'SPNCH889', new: { name: 'Spinach' }, old: { name: 'Lettuce' } },
				],
			};

			const submissionDeleteData: Record<string, SubmissionDeleteData[]> = {
				cars: [
					{
						systemId: 'AAA111',
						data: { name: 'Lambo' },
						entityName: 'cars',
						isValid: true,
						organization: 'myCollection',
					},
					{
						systemId: 'BBB222',
						data: { name: 'Beettle' },
						entityName: 'cars',
						isValid: true,
						organization: 'myCollection',
					},
				],
			};
			const result = filterUpdatesFromDeletes(submissionUpdateData, submissionDeleteData);
			expect(Object.keys(result)).to.eql(['food']);
			expect(result['food'].length).to.eq(2);
			expect(result['food']).to.eql([
				{ systemId: 'PTT123', new: { name: 'Potato' }, old: { name: 'Tomato' } },
				{ systemId: 'SPNCH889', new: { name: 'Spinach' }, old: { name: 'Lettuce' } },
			]);
		});
		it('should return empty object when passing an empty object', () => {
			const submissionDeleteData: Record<string, SubmissionDeleteData[]> = {
				cars: [
					{
						systemId: 'AAA111',
						data: { name: 'Lambo' },
						entityName: 'cars',
						isValid: true,
						organization: 'myCollection',
					},
					{
						systemId: 'BBB222',
						data: { name: 'Beettle' },
						entityName: 'cars',
						isValid: true,
						organization: 'myCollection',
					},
				],
			};
			const result = filterUpdatesFromDeletes({}, submissionDeleteData);
			expect(Object.keys(result).length).to.eq(0);
		});
	});
	describe('Finds the filter to search for Child Dependencies', () => {
		it('should return a shema relation when record is changing its primary ID field', () => {
			const schemaRelations: SchemaChildNode[] = [
				{
					schemaName: 'employee',
					fieldName: 'personId',
					parent: {
						schemaName: 'person',
						fieldName: 'personId',
					},
				},
			];
			const updateRecord: SubmissionUpdateData = {
				systemId: 'SSS001',
				new: { personId: 'PPPPP001' },
				old: { personId: 'RRRRR001' },
			};
			const result = filterRelationsForPrimaryIdUpdate(schemaRelations, updateRecord);
			expect(result.length).to.eq(1);
			expect(result[0]).to.eql({
				dataField: 'personId',
				dataValue: 'RRRRR001',
				entityName: 'employee',
			});
		});
		it('should return empty filter when record is not changing a primary ID field', () => {
			const schemaRelations: SchemaChildNode[] = [
				{
					schemaName: 'employee',
					fieldName: 'personId',
					parent: {
						schemaName: 'person',
						fieldName: 'personId',
					},
				},
			];
			const updateRecord: SubmissionUpdateData = {
				systemId: 'SSS001',
				new: { name: 'Pedro' },
				old: { name: 'Pedro Pedro Pedro' },
			};
			const result = filterRelationsForPrimaryIdUpdate(schemaRelations, updateRecord);
			expect(result.length).to.eq(0);
		});
	});
	describe('Group validation errors by entity', () => {
		it('retuns empty object when no there is no data being processed', () => {
			const resultValidation: Record<string, BatchProcessingResult> = {
				sports: { validationErrors: [], processedRecords: [] },
			};
			const dataValidated: Record<string, DataRecordReference[]> = {};

			const response = groupSchemaErrorsByEntity({ resultValidation, dataValidated });
			expect(response).to.eql({});
		});
		it('retuns empty object when no there no errors on Submission', () => {
			const resultValidation: Record<string, BatchProcessingResult> = {
				sports: {
					validationErrors: [
						{
							info: {},
							index: 0,
							message: 'UNRECOGNIZED_FIELD',
							errorType: SchemaValidationErrorTypes.UNRECOGNIZED_FIELD,
							fieldName: 'systemId',
						},
						{
							info: {
								value: ['Homme'],
							},
							index: 1,
							message: 'The value is not permissible for this field.',
							errorType: SchemaValidationErrorTypes.INVALID_ENUM_VALUE,
							fieldName: 'sex_at_birth',
						},
					],
					processedRecords: [{ systemId: 'XYZ123' }, { sex_at_birth: 'Homme' }],
				},
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
			const resultValidation: Record<string, BatchProcessingResult> = {
				sports: {
					validationErrors: [
						{
							info: {},
							index: 0,
							message: 'UNRECOGNIZED_FIELD',
							errorType: SchemaValidationErrorTypes.UNRECOGNIZED_FIELD,
							fieldName: 'systemId',
						},
						{
							info: {
								value: ['Homme'],
							},
							index: 1,
							message: 'The value is not permissible for this field.',
							errorType: SchemaValidationErrorTypes.INVALID_ENUM_VALUE,
							fieldName: 'sex_at_birth',
						},
					],
					processedRecords: [{ systemId: 'XYZ123' }, { sex_at_birth: 'Homme' }],
				},
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
				{
					info: {},
					index: 12,
					message: 'UNRECOGNIZED_FIELD',
					errorType: SchemaValidationErrorTypes.UNRECOGNIZED_FIELD,
					fieldName: 'systemId',
				},
				{
					info: {
						value: ['Homme'],
					},
					index: 12,
					message: 'The value is not permissible for this field.',
					errorType: SchemaValidationErrorTypes.INVALID_ENUM_VALUE,
					fieldName: 'sex_at_birth',
				},
			]);
		});
		it('retuns errors found on the Submission updates', () => {
			const resultValidation: Record<string, BatchProcessingResult> = {
				sports: {
					validationErrors: [
						{
							info: {},
							index: 0,
							message: 'UNRECOGNIZED_FIELD',
							errorType: SchemaValidationErrorTypes.UNRECOGNIZED_FIELD,
							fieldName: 'systemId',
						},
						{
							info: {
								value: ['Homme'],
							},
							index: 1,
							message: 'The value is not permissible for this field.',
							errorType: SchemaValidationErrorTypes.INVALID_ENUM_VALUE,
							fieldName: 'sex_at_birth',
						},
					],
					processedRecords: [{ systemId: 'XYZ123' }, { sex_at_birth: 'Homme' }],
				},
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
					info: {},
					index: 12,
					message: 'UNRECOGNIZED_FIELD',
					errorType: SchemaValidationErrorTypes.UNRECOGNIZED_FIELD,
					fieldName: 'systemId',
				},
				{
					info: {
						value: ['Homme'],
					},
					index: 12,
					message: 'The value is not permissible for this field.',
					errorType: SchemaValidationErrorTypes.INVALID_ENUM_VALUE,
					fieldName: 'sex_at_birth',
				},
			]);
		});
	});
	describe('Transforms inserts from the Submission object into a Record grouped by entityName', () => {
		it('should return an object grouped by entity name with 2 records', () => {
			const submissionInsertData: SubmissionInsertData = {
				batchName: 'cars.tsv',
				records: [
					{
						name: 'Lamborghini Murcielago',
					},
					{
						name: 'Lamborghini Gallardo',
					},
				],
			};

			const response = mapInsertDataToRecordReferences(100, { cars: submissionInsertData });
			expect(Object.keys(response)).to.eql(['cars']);
			expect(response['cars'].length).to.eq(2);
			expect(response['cars']).to.eql([
				{
					dataRecord: {
						name: 'Lamborghini Murcielago',
					},
					reference: {
						submissionId: 100,
						type: MERGE_REFERENCE_TYPE.NEW_SUBMITTED_DATA,
						index: 0,
					},
				},
				{
					dataRecord: {
						name: 'Lamborghini Gallardo',
					},
					reference: {
						submissionId: 100,
						type: MERGE_REFERENCE_TYPE.NEW_SUBMITTED_DATA,
						index: 1,
					},
				},
			]);
		});
		it('should return 2 objects grouped by entity names with 2 records each one', () => {
			const submissionInsertDataCars: SubmissionInsertData = {
				batchName: 'cars.tsv',
				records: [
					{
						name: 'Lamborghini Murcielago',
					},
					{
						name: 'Lamborghini Gallardo',
					},
				],
			};

			const submissionInsertDataAnimals: SubmissionInsertData = {
				batchName: 'animals.tsv',
				records: [
					{
						name: 'Cat',
					},
					{
						name: 'Dog',
					},
				],
			};

			const response = mapInsertDataToRecordReferences(100, {
				cars: submissionInsertDataCars,
				animals: submissionInsertDataAnimals,
			});
			expect(Object.keys(response)).to.eql(['cars', 'animals']);
			expect(response['cars'].length).to.eq(2);
			expect(response['animals'].length).to.eq(2);
			expect(response['cars']).to.eql([
				{
					dataRecord: {
						name: 'Lamborghini Murcielago',
					},
					reference: {
						submissionId: 100,
						type: MERGE_REFERENCE_TYPE.NEW_SUBMITTED_DATA,
						index: 0,
					},
				},
				{
					dataRecord: {
						name: 'Lamborghini Gallardo',
					},
					reference: {
						submissionId: 100,
						type: MERGE_REFERENCE_TYPE.NEW_SUBMITTED_DATA,
						index: 1,
					},
				},
			]);
			expect(response['animals']).to.eql([
				{
					dataRecord: {
						name: 'Cat',
					},
					reference: {
						submissionId: 100,
						type: MERGE_REFERENCE_TYPE.NEW_SUBMITTED_DATA,
						index: 0,
					},
				},
				{
					dataRecord: {
						name: 'Dog',
					},
					reference: {
						submissionId: 100,
						type: MERGE_REFERENCE_TYPE.NEW_SUBMITTED_DATA,
						index: 1,
					},
				},
			]);
		});
		it('should return an objects grouped by entity names with zero records', () => {
			const submissionInsertDataFruits: SubmissionInsertData = {
				batchName: 'fruit.tsv',
				records: [],
			};

			const response = mapInsertDataToRecordReferences(101, {
				fruit: submissionInsertDataFruits,
			});
			expect(Object.keys(response)).to.eql(['fruit']);
			expect(response['fruit'].length).to.eq(0);
			expect(response['fruit']).to.eql([]);
		});
		it('should return an empty object', () => {
			const submissionInsertDataFruits: SubmissionInsertData = {
				batchName: '',
				records: [],
			};

			const response = mapInsertDataToRecordReferences(103, {
				'': submissionInsertDataFruits,
			});
			expect(Object.keys(response)).to.eql(['']);
			expect(response[''].length).to.eq(0);
			expect(response['']).to.eql([]);
		});
	});
	describe('Transforms updates from the Submission object into a Record grouped by entityName', () => {
		it('should return an object grouped by entity name with 1 udpated record', () => {
			const dependant1: SubmittedData = {
				id: 5,
				data: { name: 'tiger', scientificName: 'tigris' },
				dictionaryCategoryId: 20,
				entityName: 'animals',
				isValid: true,
				lastValidSchemaId: 20,
				organization: 'zoo',
				originalSchemaId: 20,
				systemId: 'TGR1425',
				createdAt: todaysDate,
				createdBy: 'me',
				updatedAt: null,
				updatedBy: null,
			};

			const dependentData: Record<string, SubmittedData[]> = { animals: [dependant1] };
			const filterEntity: {
				entityName: string;
				dataField: string;
				dataValue: string;
			}[] = [
				{ entityName: 'animals', dataField: 'scientificName', dataValue: 'tigris' },
				{ entityName: 'plants', dataField: 'scientificName', dataValue: 'tigris' },
			];
			const newDataRecord: DataRecord = {
				scientificName: 'Panthera Tigris',
				description: 'something here',
			};
			const response = mapGroupedUpdateSubmissionData({ dependentData, filterEntity, newDataRecord });
			expect(Object.keys(response).length).to.eq(1);
			expect(Object.keys(response)).to.eql(['animals']);
			expect(response['animals'].length).to.eq(1);
			expect(response['animals'][0]).to.eql({
				systemId: 'TGR1425',
				old: { scientificName: 'tigris' },
				new: { scientificName: 'Panthera Tigris' },
			});
		});
	});
	describe('Combine Active Submission and the Submitted Data with reference', () => {
		it('returns only SubmittedData data when Submission doesnt contain data', () => {
			const originalSubmission: Submission = {
				id: 2,
				data: {},
				dictionaryId: 14,
				dictionaryCategoryId: 20,
				errors: {},
				organization: 'zoo',
				status: SUBMISSION_STATUS.OPEN,
				createdAt: todaysDate,
				createdBy: 'me',
				updatedAt: null,
				updatedBy: null,
			};
			const submissionData: SubmissionData = {};
			const submittedData: SubmittedData[] = [
				{
					id: 5,
					data: { name: 'tiger', color: 'yellow' },
					dictionaryCategoryId: 20,
					entityName: 'animals',
					isValid: true,
					lastValidSchemaId: 20,
					organization: 'zoo',
					originalSchemaId: 20,
					systemId: 'TGR1425',
					createdAt: todaysDate,
					createdBy: 'me',
					updatedAt: null,
					updatedBy: null,
				},
			];
			const response = mergeAndReferenceEntityData({ originalSubmission, submissionData, submittedData });
			expect(Object.keys(response).length).to.eq(1);
			expect(Object.keys(response)).to.eql(['animals']);
			expect(response['animals'].length).eq(1);
			expect(response['animals']).eql([
				{
					dataRecord: { name: 'tiger', color: 'yellow' },
					reference: {
						systemId: 'TGR1425',
						submittedDataId: 5,
						type: MERGE_REFERENCE_TYPE.SUBMITTED_DATA,
					},
				},
			]);
		});
		it('returns combination of SubmittedData and Submission insert data', () => {
			const originalSubmission: Submission = {
				id: 2,
				data: {},
				dictionaryId: 14,
				dictionaryCategoryId: 20,
				errors: {},
				organization: 'zoo',
				status: SUBMISSION_STATUS.OPEN,
				createdAt: todaysDate,
				createdBy: 'me',
				updatedAt: null,
				updatedBy: null,
			};
			const submissionData: SubmissionData = {
				inserts: {
					animals: {
						batchName: 'animals.tsv',
						records: [
							{ name: 'elephant', color: 'gray' },
							{ name: 'beaver', color: 'brown' },
						],
					},
				},
			};
			const submittedData: SubmittedData[] = [
				{
					id: 5,
					data: { name: 'tiger', color: 'yellow' },
					dictionaryCategoryId: 20,
					entityName: 'animals',
					isValid: true,
					lastValidSchemaId: 20,
					organization: 'zoo',
					originalSchemaId: 20,
					systemId: 'TGR1425',
					createdAt: todaysDate,
					createdBy: 'me',
					updatedAt: null,
					updatedBy: null,
				},
			];
			const response = mergeAndReferenceEntityData({ originalSubmission, submissionData, submittedData });
			expect(Object.keys(response).length).to.eq(1);
			expect(Object.keys(response)).to.eql(['animals']);
			expect(response['animals'].length).eq(3);
			expect(response['animals']).eql([
				{
					dataRecord: { name: 'tiger', color: 'yellow' },
					reference: {
						systemId: 'TGR1425',
						submittedDataId: 5,
						type: MERGE_REFERENCE_TYPE.SUBMITTED_DATA,
					},
				},
				{
					dataRecord: { name: 'elephant', color: 'gray' },
					reference: {
						index: 0,
						submissionId: 2,
						type: MERGE_REFERENCE_TYPE.NEW_SUBMITTED_DATA,
					},
				},
				{
					dataRecord: { name: 'beaver', color: 'brown' },
					reference: {
						index: 1,
						submissionId: 2,
						type: MERGE_REFERENCE_TYPE.NEW_SUBMITTED_DATA,
					},
				},
			]);
		});
		it('returns combination of SubmittedData and Submission update data', () => {
			const originalSubmission: Submission = {
				id: 2,
				data: {},
				dictionaryId: 14,
				dictionaryCategoryId: 20,
				errors: {},
				organization: 'zoo',
				status: SUBMISSION_STATUS.OPEN,
				createdAt: todaysDate,
				createdBy: 'me',
				updatedAt: null,
				updatedBy: null,
			};
			const submissionData: SubmissionData = {
				updates: {
					animals: [
						{ systemId: 'TGR1425', old: { color: 'yellow' }, new: { color: 'orange' } },
						{ systemId: 'BR8912', old: { color: 'black' }, new: { color: 'brown' } },
					],
				},
			};
			const submittedData: SubmittedData[] = [
				{
					id: 5,
					data: { name: 'tiger', color: 'yellow' },
					dictionaryCategoryId: 20,
					entityName: 'animals',
					isValid: true,
					lastValidSchemaId: 20,
					organization: 'zoo',
					originalSchemaId: 20,
					systemId: 'TGR1425',
					createdAt: todaysDate,
					createdBy: 'me',
					updatedAt: null,
					updatedBy: null,
				},
				{
					id: 6,
					data: { name: 'bear', color: 'black' },
					dictionaryCategoryId: 20,
					entityName: 'animals',
					isValid: true,
					lastValidSchemaId: 20,
					organization: 'zoo',
					originalSchemaId: 20,
					systemId: 'BR8912',
					createdAt: todaysDate,
					createdBy: 'me',
					updatedAt: null,
					updatedBy: null,
				},
			];
			const response = mergeAndReferenceEntityData({ originalSubmission, submissionData, submittedData });
			expect(Object.keys(response).length).to.eq(1);
			expect(Object.keys(response)).to.eql(['animals']);
			expect(response['animals'].length).eq(2);
			expect(response['animals']).eql([
				{
					dataRecord: { name: 'tiger', color: 'orange' },
					reference: {
						systemId: 'TGR1425',
						submissionId: 2,
						index: 0,
						type: MERGE_REFERENCE_TYPE.EDIT_SUBMITTED_DATA,
					},
				},
				{
					dataRecord: { name: 'bear', color: 'brown' },
					reference: {
						systemId: 'BR8912',
						submissionId: 2,
						index: 1,
						type: MERGE_REFERENCE_TYPE.EDIT_SUBMITTED_DATA,
					},
				},
			]);
		});
		it('returns combination of SubmittedData and Submission delete data', () => {
			const originalSubmission: Submission = {
				id: 2,
				data: {},
				dictionaryId: 14,
				dictionaryCategoryId: 20,
				errors: {},
				organization: 'zoo',
				status: SUBMISSION_STATUS.OPEN,
				createdAt: todaysDate,
				createdBy: 'me',
				updatedAt: null,
				updatedBy: null,
			};
			const submissionData: SubmissionData = {
				deletes: {
					animals: [
						{
							systemId: 'TGR1425',
							data: { name: 'tiger', color: 'yellow' },
							entityName: 'animals',
							isValid: true,
							organization: 'zoo',
						},
						{
							systemId: 'BR8912',
							data: { name: 'bear', color: 'black' },
							entityName: 'animals',
							isValid: true,
							organization: 'zoo',
						},
					],
				},
			};
			const submittedData: SubmittedData[] = [
				{
					id: 5,
					data: { name: 'tiger', color: 'yellow' },
					dictionaryCategoryId: 20,
					entityName: 'animals',
					isValid: true,
					lastValidSchemaId: 20,
					organization: 'zoo',
					originalSchemaId: 20,
					systemId: 'TGR1425',
					createdAt: todaysDate,
					createdBy: 'me',
					updatedAt: null,
					updatedBy: null,
				},
				{
					id: 6,
					data: { name: 'bear', color: 'black' },
					dictionaryCategoryId: 20,
					entityName: 'animals',
					isValid: true,
					lastValidSchemaId: 20,
					organization: 'zoo',
					originalSchemaId: 20,
					systemId: 'BR8912',
					createdAt: todaysDate,
					createdBy: 'me',
					updatedAt: null,
					updatedBy: null,
				},
			];
			const response = mergeAndReferenceEntityData({ originalSubmission, submissionData, submittedData });
			expect(Object.keys(response).length).to.eq(0);
			expect(response).eql({});
		});
	});
	describe('Merge 2 generic Records into a single Record', () => {
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
	describe('Merge multiple Submission insert records', () => {
		it('should return a record object with one key and merged array items', () => {
			const obj1: Record<string, SubmissionInsertData> = {
				sports: { batchName: 'sports.tsv', records: [{ title: 'footbal' }] },
			};
			const obj2: Record<string, SubmissionInsertData> = {
				sports: { batchName: 'sports', records: [{ title: 'basketball' }] },
			};
			const result = mergeInsertsRecords(obj1, obj2);
			expect(Object.keys(result).length).to.eq(1);
			expect(result['sports'].records.length).eql(2);
		});

		it('should return a record object with two different keys', () => {
			const obj1: Record<string, SubmissionInsertData> = {
				food: { batchName: 'food.tsv', records: [{ title: 'apple' }] },
			};
			const obj2: Record<string, SubmissionInsertData> = {
				sports: { batchName: 'sports', records: [{ title: 'basketball' }] },
			};
			const result = mergeInsertsRecords(obj1, obj2);
			expect(Object.keys(result).length).to.eq(2);
			expect(result['sports'].records.length).eql(1);
			expect(result['food'].records.length).eql(1);
		});

		it('should return a record object with one key and merged array items without duplication', () => {
			const obj1: Record<string, SubmissionInsertData> = {
				sports: { batchName: 'sports.tsv', records: [{ title: 'snowboarding' }] },
			};
			const obj2: Record<string, SubmissionInsertData> = {
				sports: { batchName: 'sports.csv', records: [{ title: 'snowboarding' }] },
			};
			const result = mergeInsertsRecords(obj1, obj2);
			expect(Object.keys(result).length).to.eq(1);
			expect(result['sports'].records.length).to.eq(1);
			expect(result['sports'].records[0]).eql({ title: 'snowboarding' });
		});
	});
	describe('Merge multiple Submission delete records', () => {
		it('should return an object with 2 records within the same key', () => {
			const deletes1: Record<string, SubmissionDeleteData[]> = {
				food: [
					{ data: { name: 'pizza' }, entityName: 'food', isValid: true, organization: 'kitchen', systemId: 'PZ8900' },
				],
			};
			const deletes2: Record<string, SubmissionDeleteData[]> = {
				food: [
					{
						data: { name: 'pizza' },
						entityName: 'hamburger',
						isValid: true,
						organization: 'kitchen',
						systemId: 'HG1234',
					},
				],
			};
			const response = mergeDeleteRecords(deletes1, deletes2);
			expect(Object.keys(response).length).eq(1);
			expect(Object.keys(response)[0]).eql('food');
			expect(response['food'].length).eq(2);
			expect(response['food']).eql([
				{ data: { name: 'pizza' }, entityName: 'food', isValid: true, organization: 'kitchen', systemId: 'PZ8900' },
				{
					data: { name: 'pizza' },
					entityName: 'hamburger',
					isValid: true,
					organization: 'kitchen',
					systemId: 'HG1234',
				},
			]);
		});
		it('should return an object with 2 records with different key', () => {
			const deletes1: Record<string, SubmissionDeleteData[]> = {
				food: [
					{ data: { name: 'pizza' }, entityName: 'food', isValid: true, organization: 'kitchen', systemId: 'PZ8900' },
				],
			};
			const deletes2: Record<string, SubmissionDeleteData[]> = {
				animal: [
					{
						data: { name: 'lion' },
						entityName: 'animal',
						isValid: false,
						organization: 'zoo',
						systemId: 'LN5566',
					},
				],
			};
			const response = mergeDeleteRecords(deletes1, deletes2);
			expect(Object.keys(response).length).eq(2);
			expect(Object.keys(response)).eql(['food', 'animal']);
			expect(response['food'].length).eq(1);
			expect(response['animal'].length).eq(1);
			expect(response['food'][0]).eql({
				data: { name: 'pizza' },
				entityName: 'food',
				isValid: true,
				organization: 'kitchen',
				systemId: 'PZ8900',
			});
			expect(response['animal'][0]).eql({
				data: { name: 'lion' },
				entityName: 'animal',
				isValid: false,
				organization: 'zoo',
				systemId: 'LN5566',
			});
		});
		it('should avoid duplication and return an object with 1 record', () => {
			const deletes1: Record<string, SubmissionDeleteData[]> = {
				food: [
					{ data: { name: 'Paella' }, entityName: 'food', isValid: true, organization: 'kitchen', systemId: 'PAE344' },
				],
			};
			const deletes2: Record<string, SubmissionDeleteData[]> = {
				food: [
					{ data: { name: 'Paella' }, entityName: 'food', isValid: true, organization: 'kitchen', systemId: 'PAE344' },
				],
			};
			const deletes3: Record<string, SubmissionDeleteData[]> = {
				food: [
					{ data: { name: 'Paella' }, entityName: 'food', isValid: true, organization: 'kitchen', systemId: 'PAE344' },
				],
			};
			const response = mergeDeleteRecords(deletes1, deletes2, deletes3);
			expect(Object.keys(response).length).eq(1);
			expect(Object.keys(response)).eql(['food']);
			expect(response['food'].length).eq(1);
			expect(response['food'][0]).eql({
				data: { name: 'Paella' },
				entityName: 'food',
				isValid: true,
				organization: 'kitchen',
				systemId: 'PAE344',
			});
		});
	});
	describe('Merge multiple Submission Update records', () => {
		it('should return an object with 2 recrods withing the same key', () => {
			const update1: Record<string, SubmissionUpdateData[]> = {
				animal: [{ systemId: 'GRL3839', new: { name: 'Gorilla' }, old: { name: 'alliroG' } }],
			};
			const update2: Record<string, SubmissionUpdateData[]> = {
				animal: [{ systemId: 'CAM1929', new: { name: 'Cammel' }, old: { name: 'lemmaC' } }],
			};
			const result = mergeUpdatesBySystemId(update1, update2);
			expect(Object.keys(result).length).eq(1);
			expect(Object.keys(result)[0]).eql('animal');
			expect(result['animal'].length).eq(2);
			expect(result['animal']).eql([
				{ systemId: 'GRL3839', new: { name: 'Gorilla' }, old: { name: 'alliroG' } },
				{ systemId: 'CAM1929', new: { name: 'Cammel' }, old: { name: 'lemmaC' } },
			]);
		});
		it('should return an object with 2 records with different key', () => {
			const update1: Record<string, SubmissionUpdateData[]> = {
				animal: [{ systemId: 'GRL3839', new: { name: 'Gorilla' }, old: { name: 'alliroG' } }],
			};
			const update2: Record<string, SubmissionUpdateData[]> = {
				movies: [{ systemId: 'SPD001', new: { name: 'Spiderman' }, old: { name: 'Spidey' } }],
			};
			const result = mergeUpdatesBySystemId(update1, update2);
			expect(Object.keys(result).length).eq(2);
			expect(Object.keys(result)).eql(['animal', 'movies']);
			expect(result['animal'].length).eq(1);
			expect(result['animal'][0]).eql({ systemId: 'GRL3839', new: { name: 'Gorilla' }, old: { name: 'alliroG' } });
			expect(result['movies'].length).eq(1);
			expect(result['movies'][0]).eql({ systemId: 'SPD001', new: { name: 'Spiderman' }, old: { name: 'Spidey' } });
		});
		it('should avoid duplication and return an object with 1 record', () => {
			const update1: Record<string, SubmissionUpdateData[]> = {
				movies: [{ systemId: 'SPD001', new: { name: 'Spiderman' }, old: { name: 'Spidey' } }],
			};
			const update2: Record<string, SubmissionUpdateData[]> = {
				movies: [{ systemId: 'SPD001', new: { name: 'Spiderman' }, old: { name: 'Spidey' } }],
			};
			const update3: Record<string, SubmissionUpdateData[]> = {
				movies: [{ systemId: 'SPD001', new: { name: 'Spiderman' }, old: { name: 'Spidey' } }],
			};
			const result = mergeUpdatesBySystemId(update1, update2, update3);
			expect(Object.keys(result).length).eq(1);
			expect(Object.keys(result)[0]).eql('movies');
			expect(result['movies'].length).eq(1);
			expect(result['movies'][0]).eql({ systemId: 'SPD001', new: { name: 'Spiderman' }, old: { name: 'Spidey' } });
		});
	});
	describe('Parse a Submisison object to a response format', () => {
		it('return a Submission response with no data', () => {
			const activeSubmissionSummaryRepository: ActiveSubmissionSummaryRepository = {
				id: 2,
				data: {},
				dictionary: {},
				dictionaryCategory: {},
				errors: {},
				organization: 'oicr',
				status: SUBMISSION_STATUS.OPEN,
				createdAt: todaysDate,
				createdBy: 'me',
				updatedAt: null,
				updatedBy: null,
			};
			const response = parseActiveSubmissionResponse(activeSubmissionSummaryRepository);
			expect(response).to.eql({
				id: 2,
				data: {},
				dictionary: {},
				dictionaryCategory: {},
				errors: {},
				organization: 'oicr',
				status: SUBMISSION_STATUS.OPEN,
				createdAt: todaysDate.toISOString(),
				createdBy: 'me',
				updatedAt: '',
				updatedBy: '',
			});
		});
		it('return a Submission response format with insert, update and delete data', () => {
			const activeSubmissionSummaryRepository: ActiveSubmissionSummaryRepository = {
				id: 2,
				data: {
					inserts: {
						books: {
							batchName: 'books.tsv',
							records: [
								{
									title: 'abc',
								},
							],
						},
					},
					updates: {
						books: [
							{
								systemId: 'QWE987',
								new: { title: 'The Little Prince' },
								old: { title: 'the little prince' },
							},
						],
					},
					deletes: {
						books: [
							{
								systemId: 'ZXC678',
								entityName: 'books',
								organization: 'oicr',
								isValid: true,
								data: { title: 'batman' },
							},
						],
					},
				},
				dictionary: {},
				dictionaryCategory: {},
				errors: {},
				organization: 'oicr',
				status: SUBMISSION_STATUS.OPEN,
				createdAt: todaysDate,
				createdBy: 'me',
				updatedAt: null,
				updatedBy: null,
			};
			const response = parseActiveSubmissionResponse(activeSubmissionSummaryRepository);
			expect(response).to.eql({
				id: 2,
				data: {
					inserts: {
						books: {
							batchName: 'books.tsv',
							records: [
								{
									title: 'abc',
								},
							],
						},
					},
					updates: {
						books: [
							{
								systemId: 'QWE987',
								new: { title: 'The Little Prince' },
								old: { title: 'the little prince' },
							},
						],
					},
					deletes: {
						books: [
							{
								systemId: 'ZXC678',
								entityName: 'books',
								organization: 'oicr',
								isValid: true,
								data: { title: 'batman' },
							},
						],
					},
				},
				dictionary: {},
				dictionaryCategory: {},
				errors: {},
				organization: 'oicr',
				status: SUBMISSION_STATUS.OPEN,
				createdAt: todaysDate.toISOString(),
				createdBy: 'me',
				updatedAt: '',
				updatedBy: '',
			});
		});
	});
	describe('Parse a Submission object to a Summary of the Active Submission', () => {
		it('should return a Summary without any data ', () => {
			const activeSubmissionSummaryRepository: ActiveSubmissionSummaryRepository = {
				id: 4,
				data: {},
				dictionary: {},
				dictionaryCategory: {},
				errors: {},
				organization: 'oicr',
				status: SUBMISSION_STATUS.VALID,
				createdAt: todaysDate,
				createdBy: 'me',
				updatedAt: null,
				updatedBy: null,
			};
			const response = parseActiveSubmissionSummaryResponse(activeSubmissionSummaryRepository);
			expect(response).to.eql({
				id: 4,
				data: {
					inserts: undefined,
					updates: undefined,
					deletes: undefined,
				},
				dictionary: {},
				dictionaryCategory: {},
				errors: {},
				organization: 'oicr',
				status: SUBMISSION_STATUS.VALID,
				createdAt: todaysDate.toISOString(),
				createdBy: 'me',
				updatedAt: '',
				updatedBy: '',
			});
		});
		it('should return a Summary with insert, update and delete data ', () => {
			const activeSubmissionSummaryRepository: ActiveSubmissionSummaryRepository = {
				id: 3,
				data: {
					inserts: {
						books: {
							batchName: 'books.tsv',
							records: [
								{
									title: 'abc',
								},
							],
						},
					},
					updates: {
						books: [
							{
								systemId: 'QWE987',
								new: { title: 'The Little Prince' },
								old: { title: 'the little prince' },
							},
						],
					},
					deletes: {
						books: [
							{
								systemId: 'ZXC678',
								entityName: 'books',
								organization: 'oicr',
								isValid: true,
								data: { title: 'batman' },
							},
						],
					},
				},
				dictionary: {},
				dictionaryCategory: {},
				errors: {},
				organization: 'oicr',
				status: SUBMISSION_STATUS.VALID,
				createdAt: todaysDate,
				createdBy: 'me',
				updatedAt: null,
				updatedBy: null,
			};
			const response = parseActiveSubmissionSummaryResponse(activeSubmissionSummaryRepository);
			expect(response).to.eql({
				id: 3,
				data: {
					inserts: {
						books: {
							batchName: 'books.tsv',
							recordsCount: 1,
						},
					},
					updates: {
						books: {
							recordsCount: 1,
						},
					},
					deletes: {
						books: {
							recordsCount: 1,
						},
					},
				},
				dictionary: {},
				dictionaryCategory: {},
				errors: {},
				organization: 'oicr',
				status: SUBMISSION_STATUS.VALID,
				createdAt: todaysDate.toISOString(),
				createdBy: 'me',
				updatedAt: '',
				updatedBy: '',
			});
		});
	});
	describe('Removes items from submission based on filter parameters', () => {
		const insertDataSubmission: SubmissionData = {
			inserts: {
				sports: {
					batchName: 'sports.tsv',
					records: [
						{
							name: 'Breakdance',
						},
						{
							name: 'Skateboarding',
						},
					],
				},
				food: {
					batchName: 'food.xml',
					records: [
						{
							name: 'Poutine',
						},
					],
				},
			},
		};

		const updateDataSubmission: SubmissionData = {
			updates: {
				sports: [
					{
						systemId: 'QWE987',
						new: { name: 'Basketball 3X3' },
						old: { name: 'Basketball' },
					},
					{
						systemId: 'SWI321',
						new: { name: 'Swimming' },
						old: { name: 'swiming' },
					},
				],
				food: [
					{
						systemId: 'PTO456',
						new: { name: 'Potato' },
						old: { name: 'potahto' },
					},
				],
			},
		};

		const deleteDataSubmission: SubmissionData = {
			deletes: {
				sports: [
					{
						systemId: 'ZXC678',
						entityName: 'sports',
						organization: 'olimpics',
						isValid: true,
						data: { name: 'Baseball' },
					},
					{
						systemId: 'SFT098',
						entityName: 'sports',
						organization: 'olimpics',
						isValid: true,
						data: { name: 'Softball' },
					},
				],
				food: [
					{
						systemId: 'EGG789',
						entityName: 'food',
						organization: 'olimpics',
						isValid: true,
						data: { name: 'Eggpplant' },
					},
				],
			},
		};
		it('should return an empty response when Submission is empty', () => {
			const submissionData: SubmissionData = {};
			const filter: { actionType: SubmissionActionType; entityName: string; index: number | null } = {
				actionType: SUBMISSION_ACTION_TYPE.Values.INSERTS,
				entityName: 'sports',
				index: 0,
			};
			const response = removeItemsFromSubmission(submissionData, filter);
			expect(response).to.eql({});
		});
		it('should returm intact SubmissionData when filter doesnt find anything', () => {
			const fullSubmissionData: SubmissionData = {
				...insertDataSubmission,
				...updateDataSubmission,
				...deleteDataSubmission,
			};
			const filter: { actionType: SubmissionActionType; entityName: string; index: number | null } = {
				actionType: SUBMISSION_ACTION_TYPE.Values.INSERTS,
				entityName: 'animals', // item doesn't belong in the submission
				index: 0,
			};
			const response = removeItemsFromSubmission(fullSubmissionData, filter);
			expect(response).to.eql({
				inserts: {
					sports: {
						batchName: 'sports.tsv',
						records: [
							{
								name: 'Breakdance',
							},
							{
								name: 'Skateboarding',
							},
						],
					},
					food: {
						batchName: 'food.xml',
						records: [
							{
								name: 'Poutine',
							},
						],
					},
				},
				updates: {
					sports: [
						{
							systemId: 'QWE987',
							new: { name: 'Basketball 3X3' },
							old: { name: 'Basketball' },
						},
						{
							systemId: 'SWI321',
							new: { name: 'Swimming' },
							old: { name: 'swiming' },
						},
					],
					food: [
						{
							systemId: 'PTO456',
							new: { name: 'Potato' },
							old: { name: 'potahto' },
						},
					],
				},
				deletes: {
					sports: [
						{
							systemId: 'ZXC678',
							entityName: 'sports',
							organization: 'olimpics',
							isValid: true,
							data: { name: 'Baseball' },
						},
						{
							systemId: 'SFT098',
							entityName: 'sports',
							organization: 'olimpics',
							isValid: true,
							data: { name: 'Softball' },
						},
					],
					food: [
						{
							systemId: 'EGG789',
							entityName: 'food',
							organization: 'olimpics',
							isValid: true,
							data: { name: 'Eggpplant' },
						},
					],
				},
			});
		});
		it('should remove whole inserts object from SubmissionData', () => {
			const insertOnseSubmission: SubmissionData = {
				inserts: {
					sports: {
						batchName: 'sports.tsv',
						records: [
							{
								name: 'Snowboarding',
							},
						],
					},
				},
			};
			const filter: { actionType: SubmissionActionType; entityName: string; index: number | null } = {
				actionType: SUBMISSION_ACTION_TYPE.Values.INSERTS,
				entityName: 'sports',
				index: null,
			};
			const response = removeItemsFromSubmission(insertOnseSubmission, filter);
			expect(response).to.eql({});
		});
		it('should remove whole updates object from SubmissionData', () => {
			const updateOneSubmission: SubmissionData = {
				updates: {
					sports: [
						{
							systemId: 'QWE987',
							new: { name: 'Basketball 3X3' },
							old: { name: 'Basketball' },
						},
					],
				},
			};
			const filter: { actionType: SubmissionActionType; entityName: string; index: number | null } = {
				actionType: SUBMISSION_ACTION_TYPE.Values.UPDATES,
				entityName: 'sports',
				index: null,
			};
			const response = removeItemsFromSubmission(updateOneSubmission, filter);
			expect(response).to.eql({});
		});
		it('should remove whole deletes object from SubmissionData', () => {
			const deleteOneSubmission: SubmissionData = {
				deletes: {
					sports: [
						{
							systemId: 'ZXC678',
							entityName: 'sports',
							organization: 'olimpics',
							isValid: true,
							data: { name: 'Baseball' },
						},
					],
				},
			};
			const filter: { actionType: SubmissionActionType; entityName: string; index: number | null } = {
				actionType: SUBMISSION_ACTION_TYPE.Values.DELETES,
				entityName: 'sports',
				index: null,
			};
			const response = removeItemsFromSubmission(deleteOneSubmission, filter);
			expect(response).to.eql({});
		});
		it('should remove one item from inserts object on SubmissionData', () => {
			const filter: { actionType: SubmissionActionType; entityName: string; index: number | null } = {
				actionType: SUBMISSION_ACTION_TYPE.Values.INSERTS,
				entityName: 'sports',
				index: 1,
			};
			const response = removeItemsFromSubmission(insertDataSubmission, filter);
			expect(response).to.eql({
				inserts: {
					sports: {
						batchName: 'sports.tsv',
						records: [
							{
								name: 'Breakdance',
							},
						],
					},
					food: {
						batchName: 'food.xml',
						records: [
							{
								name: 'Poutine',
							},
						],
					},
				},
			});
		});
		it('should remove one item from updates object on SubmissionData', () => {
			const filter: { actionType: SubmissionActionType; entityName: string; index: number | null } = {
				actionType: SUBMISSION_ACTION_TYPE.Values.UPDATES,
				entityName: 'sports',
				index: 1,
			};
			const response = removeItemsFromSubmission(updateDataSubmission, filter);
			expect(response).to.eql({
				updates: {
					sports: [
						{
							systemId: 'QWE987',
							new: { name: 'Basketball 3X3' },
							old: { name: 'Basketball' },
						},
					],
					food: [
						{
							systemId: 'PTO456',
							new: { name: 'Potato' },
							old: { name: 'potahto' },
						},
					],
				},
			});
		});
		it('should remove one item from deletes object on SubmissionData', () => {
			const filter: { actionType: SubmissionActionType; entityName: string; index: number | null } = {
				actionType: SUBMISSION_ACTION_TYPE.Values.DELETES,
				entityName: 'sports',
				index: 1,
			};
			const response = removeItemsFromSubmission(deleteDataSubmission, filter);
			expect(response).to.eql({
				deletes: {
					sports: [
						{
							systemId: 'ZXC678',
							entityName: 'sports',
							organization: 'olimpics',
							isValid: true,
							data: { name: 'Baseball' },
						},
					],
					food: [
						{
							systemId: 'EGG789',
							entityName: 'food',
							organization: 'olimpics',
							isValid: true,
							data: { name: 'Eggpplant' },
						},
					],
				},
			});
		});
		it('should remove inserts if no items are left on the records array', () => {
			const insertOnseSubmission: SubmissionData = {
				inserts: {
					sports: {
						batchName: 'sports.tsv',
						records: [
							{
								name: 'Snowboarding',
							},
						],
					},
				},
			};

			const filter: { actionType: SubmissionActionType; entityName: string; index: number | null } = {
				actionType: SUBMISSION_ACTION_TYPE.Values.INSERTS,
				entityName: 'sports',
				index: 0,
			};
			const response = removeItemsFromSubmission(insertOnseSubmission, filter);
			expect(response).to.eql({});
		});
		it('should remove updates if no items are left on the array', () => {
			const updateOneSubmission: SubmissionData = {
				updates: {
					sports: [
						{
							systemId: 'QWE987',
							new: { name: 'Basketball 3X3' },
							old: { name: 'Basketball' },
						},
					],
				},
			};
			const filter: { actionType: SubmissionActionType; entityName: string; index: number | null } = {
				actionType: SUBMISSION_ACTION_TYPE.Values.UPDATES,
				entityName: 'sports',
				index: 0,
			};
			const response = removeItemsFromSubmission(updateOneSubmission, filter);
			expect(response).to.eql({});
		});
		it('should remove deletes if no items are left on the array', () => {
			const deleteOneSubmission: SubmissionData = {
				deletes: {
					sports: [
						{
							systemId: 'ZXC678',
							entityName: 'sports',
							organization: 'olimpics',
							isValid: true,
							data: { name: 'Baseball' },
						},
					],
				},
			};
			const filter: { actionType: SubmissionActionType; entityName: string; index: number | null } = {
				actionType: SUBMISSION_ACTION_TYPE.Values.DELETES,
				entityName: 'sports',
				index: 0,
			};
			const response = removeItemsFromSubmission(deleteOneSubmission, filter);
			expect(response).to.eql({});
		});
	});
	describe('Segregate the updates based on whether they involve ID fields (dependent fields) or non-ID fields', () => {
		it('returns 1 record on idFieldChangeRecord when change involves an ID field', () => {
			const submissionUpdateRecord: Record<string, SubmissionUpdateData[]> = {
				person: [{ systemId: 'PER987', new: { personId: '4' }, old: { personId: '1' } }],
			};

			const dictionaryRelations: Record<string, SchemaChildNode[]> = {
				person: [
					{
						schemaName: 'employee',
						fieldName: 'personId',
						parent: {
							schemaName: 'person',
							fieldName: 'personId',
						},
					},
				],
				employee: [],
			};

			const result = segregateFieldChangeRecords(submissionUpdateRecord, dictionaryRelations);
			expect(Object.keys(result).length).eq(2);
			expect(Object.keys(result)).eql(['idFieldChangeRecord', 'nonIdFieldChangeRecord']);
			expect(Object.keys(result['idFieldChangeRecord']).length).eq(1);
			expect(Object.keys(result['nonIdFieldChangeRecord']).length).eq(0);
			expect(Object.keys(result['idFieldChangeRecord'])[0]).eql('person');
			expect(result['idFieldChangeRecord']['person'][0]).eql({
				systemId: 'PER987',
				new: { personId: '4' },
				old: { personId: '1' },
			});
		});
		it('returns 1 record on nonIdFieldChangeRecord when change does not involve an ID field', () => {
			const submissionUpdateRecord: Record<string, SubmissionUpdateData[]> = {
				person: [{ systemId: 'PER987', new: { name: 'Pedro' }, old: { name: 'Pepe' } }],
			};
			const dictionaryRelations: Record<string, SchemaChildNode[]> = {
				person: [
					{
						schemaName: 'employee',
						fieldName: 'personId',
						parent: {
							schemaName: 'person',
							fieldName: 'personId',
						},
					},
				],
				employee: [],
			};

			const result = segregateFieldChangeRecords(submissionUpdateRecord, dictionaryRelations);
			expect(Object.keys(result).length).eq(2);
			expect(Object.keys(result)).eql(['idFieldChangeRecord', 'nonIdFieldChangeRecord']);
			expect(Object.keys(result['idFieldChangeRecord']).length).eq(0);
			expect(Object.keys(result['nonIdFieldChangeRecord']).length).eq(1);
			expect(Object.keys(result['nonIdFieldChangeRecord'])[0]).eql('person');
			expect(result['nonIdFieldChangeRecord']['person'][0]).eql({
				systemId: 'PER987',
				new: { name: 'Pedro' },
				old: { name: 'Pepe' },
			});
		});
		it('returns 1 record on idFieldChangeRecord and 1 on nonIdFieldChangeRecord', () => {
			const submissionUpdateRecord: Record<string, SubmissionUpdateData[]> = {
				person: [
					{ systemId: 'PER987', new: { name: 'Pedro' }, old: { name: 'Pepe' } },
					{ systemId: 'PER432', new: { personId: '4' }, old: { personId: '1' } },
				],
			};
			const dictionaryRelations: Record<string, SchemaChildNode[]> = {
				person: [
					{
						schemaName: 'employee',
						fieldName: 'personId',
						parent: {
							schemaName: 'person',
							fieldName: 'personId',
						},
					},
				],
				employee: [],
			};

			const result = segregateFieldChangeRecords(submissionUpdateRecord, dictionaryRelations);
			expect(Object.keys(result).length).eq(2);
			expect(Object.keys(result)).eql(['idFieldChangeRecord', 'nonIdFieldChangeRecord']);
			expect(Object.keys(result['idFieldChangeRecord']).length).eq(1);
			expect(Object.keys(result['idFieldChangeRecord'])[0]).eql('person');
			expect(result['idFieldChangeRecord']['person'][0]).eql({
				systemId: 'PER432',
				new: { personId: '4' },
				old: { personId: '1' },
			});
			expect(Object.keys(result['nonIdFieldChangeRecord']).length).eq(1);
			expect(Object.keys(result['nonIdFieldChangeRecord'])[0]).eql('person');
			expect(result['nonIdFieldChangeRecord']['person'][0]).eql({
				systemId: 'PER987',
				new: { name: 'Pedro' },
				old: { name: 'Pepe' },
			});
		});
	});
});
