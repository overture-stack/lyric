import { expect } from 'chai';
import { describe, it } from 'mocha';

import type {
	SubmissionData,
	SubmissionDeleteData,
	SubmissionInsertData,
	SubmissionUpdateData,
} from '@overture-stack/lyric-data-model';

import {
	canTransitionToClosed,
	determineIfIsSubmission,
	extractSchemaDataFromMergedDataRecords,
	mapSubmissionSchemaDataByEntityName,
	mergeRecords,
	parseActiveSubmissionResponse,
	parseActiveSubmissionSummaryResponse,
	removeItemsFromSubmission,
} from '../../src/utils/submissionUtils.js';
import {
	type ActiveSubmissionSummaryRepository,
	type DataRecordReference,
	MERGE_REFERENCE_TYPE,
	SUBMISSION_ACTION_TYPE,
	SUBMISSION_STATUS,
	type SubmissionActionType,
	type SubmissionReference,
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
			};
			const response = determineIfIsSubmission(input);
			expect(response).to.be.false;
		});
		it('should return true if it is a Submission referenced object', () => {
			const input: SubmissionReference = {
				index: 1,
				submissionId: 1,
				type: MERGE_REFERENCE_TYPE.SUBMISSION,
			};
			const response = determineIfIsSubmission(input);
			expect(response).to.be.true;
		});
	});
	describe('Extracts SchemaData from DataRecordReference Record', () => {
		it('should process a Record with mixed SubmittedData and Submission References', () => {
			const submissionReference: DataRecordReference = {
				dataRecord: { title: 'abc' },
				reference: {
					index: 12,
					submissionId: 23,
					type: MERGE_REFERENCE_TYPE.SUBMISSION,
				},
			};
			const SubmittedDataReference: DataRecordReference = {
				dataRecord: { title: 'xyz' },
				reference: {
					submittedDataId: 10,
					type: MERGE_REFERENCE_TYPE.SUBMITTED_DATA,
				},
			};
			const input: Record<string, DataRecordReference[]> = { cars: [submissionReference, SubmittedDataReference] };
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
	describe('Transforms inserts from the Submission object into an Record grouped by entityName', () => {
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

			const response = mapSubmissionSchemaDataByEntityName(100, { cars: submissionInsertData });
			expect(Object.keys(response)).to.eql(['cars']);
			expect(response['cars'].length).to.eq(2);
			expect(response['cars']).to.eql([
				{
					dataRecord: {
						name: 'Lamborghini Murcielago',
					},
					reference: {
						submissionId: 100,
						type: MERGE_REFERENCE_TYPE.SUBMISSION,
						index: 0,
					},
				},
				{
					dataRecord: {
						name: 'Lamborghini Gallardo',
					},
					reference: {
						submissionId: 100,
						type: MERGE_REFERENCE_TYPE.SUBMISSION,
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

			const response = mapSubmissionSchemaDataByEntityName(100, {
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
						type: MERGE_REFERENCE_TYPE.SUBMISSION,
						index: 0,
					},
				},
				{
					dataRecord: {
						name: 'Lamborghini Gallardo',
					},
					reference: {
						submissionId: 100,
						type: MERGE_REFERENCE_TYPE.SUBMISSION,
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
						type: MERGE_REFERENCE_TYPE.SUBMISSION,
						index: 0,
					},
				},
				{
					dataRecord: {
						name: 'Dog',
					},
					reference: {
						submissionId: 100,
						type: MERGE_REFERENCE_TYPE.SUBMISSION,
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

			const response = mapSubmissionSchemaDataByEntityName(101, {
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

			const response = mapSubmissionSchemaDataByEntityName(103, {
				'': submissionInsertDataFruits,
			});
			expect(Object.keys(response)).to.eql(['']);
			expect(response[''].length).to.eq(0);
			expect(response['']).to.eql([]);
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
								newData: { title: 'The Little Prince' },
								oldData: { title: 'the little prince' },
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
								newData: { title: 'The Little Prince' },
								oldData: { title: 'the little prince' },
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
								newData: { title: 'The Little Prince' },
								oldData: { title: 'the little prince' },
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
						newData: { name: 'Basketball 3X3' },
						oldData: { name: 'Basketball' },
					},
					{
						systemId: 'SWI321',
						newData: { name: 'Swimming' },
						oldData: { name: 'swiming' },
					},
				],
				food: [
					{
						systemId: 'PTO456',
						newData: { name: 'Potato' },
						oldData: { name: 'potahto' },
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
							newData: { name: 'Basketball 3X3' },
							oldData: { name: 'Basketball' },
						},
						{
							systemId: 'SWI321',
							newData: { name: 'Swimming' },
							oldData: { name: 'swiming' },
						},
					],
					food: [
						{
							systemId: 'PTO456',
							newData: { name: 'Potato' },
							oldData: { name: 'potahto' },
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
							newData: { name: 'Basketball 3X3' },
							oldData: { name: 'Basketball' },
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
							newData: { name: 'Basketball 3X3' },
							oldData: { name: 'Basketball' },
						},
					],
					food: [
						{
							systemId: 'PTO456',
							newData: { name: 'Potato' },
							oldData: { name: 'potahto' },
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
							newData: { name: 'Basketball 3X3' },
							oldData: { name: 'Basketball' },
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
});
