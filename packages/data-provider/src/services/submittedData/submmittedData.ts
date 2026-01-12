import * as _ from 'lodash-es';

import type { Dictionary as SchemasDictionary } from '@overture-stack/lectern-client';
import { SQON } from '@overture-stack/sqon-builder';

import { BaseDependencies } from '../../config/config.js';
import submissionRepository from '../../repository/activeSubmissionRepository.js';
import categoryRepository from '../../repository/categoryRepository.js';
import submittedRepository from '../../repository/submittedRepository.js';
import { convertSqonToQuery } from '../../utils/convertSqonToQuery.js';
import { getDictionarySchemaRelations } from '../../utils/dictionarySchemaRelations.js';
import { filterUpdatesFromDeletes, mergeDeleteRecords } from '../../utils/submissionUtils.js';
import {
	fetchDataErrorResponse,
	getEntityNamesFromFilterOptions,
	transformmSubmittedDataToSubmissionDeleteData,
} from '../../utils/submittedDataUtils.js';
import {
	CREATE_SUBMISSION_STATUS,
	type CreateSubmissionStatus,
	PaginationOptions,
	SubmittedDataResponse,
	VIEW_TYPE,
	type ViewType,
} from '../../utils/types.js';
import processor from '../submission/processor.js';
import submissionService from '../submission/submission.js';
import searchDataRelations from './searchDataRelations.js';
import viewMode from './viewMode.js';

const PAGINATION_ERROR_MESSAGES = {
	INVALID_CATEGORY_ID: 'Invalid Category ID',
	NO_DATA_FOUND: 'No Submitted data found',
} as const;

const submittedData = (dependencies: BaseDependencies) => {
	const LOG_MODULE = 'SUBMITTED_DATA_SERVICE';
	const submittedDataRepo = submittedRepository(dependencies);
	const { logger } = dependencies;
	const { convertRecordsToCompoundDocuments } = viewMode(dependencies);
	const { searchDirectDependents } = searchDataRelations(dependencies);

	const deleteSubmittedDataBySystemId = async (
		categoryId: number,
		systemId: string,
		username: string,
	): Promise<{
		description: string;
		inProcessEntities: string[];
		status: CreateSubmissionStatus;
		submissionId?: string;
	}> => {
		const { getSubmittedDataBySystemId } = submittedDataRepo;
		const { getActiveDictionaryByCategory } = categoryRepository(dependencies);
		const { getSubmissionDetailsById } = submissionRepository(dependencies);
		const { getOrCreateActiveSubmission } = submissionService(dependencies);
		const { performDataValidation } = processor(dependencies);

		// get SubmittedData by SystemId
		const foundRecordToDelete = await getSubmittedDataBySystemId(systemId);

		if (!foundRecordToDelete) {
			return {
				status: CREATE_SUBMISSION_STATUS.INVALID_SUBMISSION,
				description: `No Submitted data found with systemId '${systemId}'`,
				inProcessEntities: [],
			};
		}
		logger.info(LOG_MODULE, `Found Submitted Data with system ID '${systemId}'`);

		if (foundRecordToDelete.dictionaryCategoryId !== categoryId) {
			return {
				status: CREATE_SUBMISSION_STATUS.INVALID_SUBMISSION,
				description: `Invalid Category ID '${categoryId}' for system ID '${systemId}'`,
				inProcessEntities: [],
			};
		}

		// get current dictionary
		const currentDictionary = await getActiveDictionaryByCategory(categoryId);

		if (!currentDictionary) {
			return {
				status: CREATE_SUBMISSION_STATUS.INVALID_SUBMISSION,
				description: `Dictionary not found`,
				inProcessEntities: [],
			};
		}

		// get dictionary relations
		const dictionaryRelations = getDictionarySchemaRelations(currentDictionary.schemas);

		const recordDependents = await searchDirectDependents({
			data: foundRecordToDelete.data,
			dictionaryRelations,
			entityName: foundRecordToDelete.entityName,
			organization: foundRecordToDelete.organization,
			systemId: foundRecordToDelete.systemId,
		});
		logger.info(LOG_MODULE, `Found ${recordDependents.length} dependendencies on systemId '${systemId}'`);

		const submittedDataToDelete = [foundRecordToDelete, ...recordDependents];

		const recordsToDeleteMap = transformmSubmittedDataToSubmissionDeleteData(submittedDataToDelete);

		// Get Active Submission or Open a new one
		const activeSubmissionId = await getOrCreateActiveSubmission({
			categoryId: foundRecordToDelete.dictionaryCategoryId,
			username,
			organization: foundRecordToDelete.organization,
		});
		const activeSubmission = await getSubmissionDetailsById(activeSubmissionId);

		if (!activeSubmission) {
			return {
				status: CREATE_SUBMISSION_STATUS.INVALID_SUBMISSION,
				description: 'Active Submission not found',
				inProcessEntities: [],
			};
		}

		// Merge current Active Submission delete entities with unique records to delete based on systemId
		const mergedSubmissionDeletes = mergeDeleteRecords(activeSubmission.data.deletes || {}, recordsToDeleteMap);

		const entitiesToProcess = Object.keys(mergedSubmissionDeletes);

		// filter out update records found matching systemID on delete records
		const filteredUpdates = filterUpdatesFromDeletes(activeSubmission.data.updates ?? {}, mergedSubmissionDeletes);

		// Validate and update Active Submission
		performDataValidation({
			submissionId: activeSubmission.id,
			submissionData: {
				inserts: activeSubmission.data.inserts,
				updates: filteredUpdates,
				deletes: mergedSubmissionDeletes,
			},
			username,
		});

		logger.info(LOG_MODULE, `Added '${entitiesToProcess.length}' records to be deleted on the Active Submission`);

		return {
			status: CREATE_SUBMISSION_STATUS.PROCESSING,
			description: 'Submission data is being processed',
			submissionId: activeSubmission.id.toString(),
			inProcessEntities: entitiesToProcess,
		};
	};

	const editSubmittedData = async ({
		categoryId,
		entityName,
		organization,
		records,
		username,
	}: {
		categoryId: number;
		entityName: string;
		organization: string;
		records: Record<string, unknown>[];
		username: string;
	}): Promise<{
		description?: string;
		submissionId?: number;
		status: string;
	}> => {
		logger.info(
			LOG_MODULE,
			`Processing '${records.length}' records on category id '${categoryId}' organization '${organization}'`,
		);
		const { getActiveDictionaryByCategory } = categoryRepository(dependencies);
		const { getOrCreateActiveSubmission } = submissionService(dependencies);
		const { processEditRecordsAsync } = processor(dependencies);

		if (records.length === 0) {
			return {
				status: CREATE_SUBMISSION_STATUS.INVALID_SUBMISSION,
				description: 'No valid records for submission',
			};
		}

		const currentDictionary = await getActiveDictionaryByCategory(categoryId);

		if (_.isEmpty(currentDictionary)) {
			return {
				status: CREATE_SUBMISSION_STATUS.INVALID_SUBMISSION,
				description: `Dictionary in category '${categoryId}' not found`,
			};
		}

		const schemasDictionary: SchemasDictionary = {
			name: currentDictionary.name,
			version: currentDictionary.version,
			schemas: currentDictionary.schemas,
		};

		// Validate entity name
		const entitySchema = schemasDictionary.schemas.find((item) => item.name === entityName);
		if (!entitySchema) {
			return {
				status: CREATE_SUBMISSION_STATUS.INVALID_SUBMISSION,
				description: `Invalid entity name ${entityName} for submission`,
			};
		}

		// Get Active Submission or Open a new one
		const activeSubmissionId = await getOrCreateActiveSubmission({ categoryId, username, organization });

		// Running Schema validation in the background do not need to wait
		// Result of validations will be stored in database
		processEditRecordsAsync(records, {
			submissionId: activeSubmissionId,
			schema: entitySchema,
			username,
		});

		return {
			status: CREATE_SUBMISSION_STATUS.PROCESSING,
			description: 'Submission records are being processed',
			submissionId: activeSubmissionId,
		};
	};

	/**
	 * Fetches submitted data from the database based on the provided category ID, pagination options, and filter options.
	 *
	 * This function retrieves a list of submitted data associated with the specified `categoryId`.
	 * It also supports pagination, view representation and filtering based on entity names or a compound condition.
	 * The returned data includes both the retrieved records and metadata about the total number of records.
	 *
	 * @param categoryId - The ID of the category for which data is being fetched.
	 * @param paginationOptions - An object containing pagination options, such as page number and items per page.
	 * @param filterOptions - An object containing options for filtering the data.
	 * @param filterOptions.entityName - An optional array of entity names to filter the data by.
	 * @param filterOptions.view - An optional flag indicating the view type
	 * @param filterOptions.organization - An optional array of organizations to filter the data by. if not provided, no organization filter is applied.
	 * @returns A promise that resolves to an object containing:
	 * - `result`: An array of `SubmittedDataResponse` objects, representing the fetched data.
	 * - `metadata`: An object containing metadata about the fetched data, including the total number of records.
	 *   If an error occurs during data retrieval, `metadata` will include an `errorMessage` property.
	 */
	const getSubmittedDataByCategory = async (
		categoryId: number,
		paginationOptions: PaginationOptions,
		filterOptions: { entityName?: string[]; view: ViewType; organizations?: string[] },
	): Promise<{
		result: SubmittedDataResponse[];
		metadata: { totalRecords: number; errorMessage?: string };
	}> => {
		const { getSubmittedDataByCategoryIdPaginated, getTotalRecordsByCategoryId } = submittedDataRepo;

		const { getCategoryById } = categoryRepository(dependencies);

		const category = await getCategoryById(categoryId);

		if (!category?.activeDictionary) {
			return fetchDataErrorResponse(PAGINATION_ERROR_MESSAGES.INVALID_CATEGORY_ID);
		}

		const defaultCentricEntity = category.defaultCentricEntity || undefined;

		let recordsPaginated = await getSubmittedDataByCategoryIdPaginated(categoryId, paginationOptions, {
			entityNames: getEntityNamesFromFilterOptions(filterOptions, defaultCentricEntity),
			organizations: filterOptions.organizations,
		});

		if (recordsPaginated.length === 0) {
			return fetchDataErrorResponse(PAGINATION_ERROR_MESSAGES.NO_DATA_FOUND);
		}

		if (filterOptions.view === VIEW_TYPE.Values.compound) {
			recordsPaginated = await convertRecordsToCompoundDocuments({
				dictionary: category.activeDictionary.dictionary,
				records: recordsPaginated,
				defaultCentricEntity: defaultCentricEntity,
			});
		}

		const totalRecords = await getTotalRecordsByCategoryId(categoryId, {
			entityNames: getEntityNamesFromFilterOptions(filterOptions, defaultCentricEntity),
			organizations: filterOptions.organizations,
		});

		logger.info(LOG_MODULE, `Retrieved '${recordsPaginated.length}' Submitted data on categoryId '${categoryId}'`);

		return {
			result: recordsPaginated,
			metadata: {
				totalRecords,
			},
		};
	};

	/**
	 * Fetches submitted data from the database based on the provided category ID, organization, pagination options, and optional filter options.
	 *
	 * This function retrieves a list of submitted data associated with the specified `categoryId` and `organization`.
	 * It supports a view representation, pagination and optional filtering using a structured query (`sqon`) or entity names.
	 * The result includes both the fetched data and metadata such as the total number of records and an error message if applicable.
	 *
	 * @param categoryId - The ID of the category for which data is being fetched.
	 * @param organization - The name of the organization to filter the data by.
	 * @param paginationOptions - An object containing pagination options, such as page number and items per page.
	 * @param filterOptions - Optional filtering options.
	 * @param filterOptions.sqon - An optional Structured Query Object Notation (SQON) for advanced filtering criteria.
	 * @param filterOptions.entityName - An optional array of entity names to filter the data by. Can include undefined entries.
	 * @param filterOptions.view - An optional flag indicating the view type
	 * @returns A promise that resolves to an object containing:
	 * - `result`: An array of `SubmittedDataResponse` objects, representing the fetched data.
	 * - `metadata`: An object containing metadata about the fetched data, including the total number of records.
	 *   If an error occurs during data retrieval, `metadata` will include an `errorMessage` property.
	 */
	const getSubmittedDataByOrganization = async (
		categoryId: number,
		organization: string,
		paginationOptions: PaginationOptions,
		filterOptions: { sqon?: SQON; entityName?: string[]; view: ViewType },
	): Promise<{ result: SubmittedDataResponse[]; metadata: { totalRecords: number; errorMessage?: string } }> => {
		const { getSubmittedDataByCategoryIdAndOrganizationPaginated, getTotalRecordsByCategoryIdAndOrganization } =
			submittedDataRepo;
		const { getCategoryById } = categoryRepository(dependencies);

		const category = await getCategoryById(categoryId);

		if (!category?.activeDictionary) {
			return fetchDataErrorResponse(PAGINATION_ERROR_MESSAGES.INVALID_CATEGORY_ID);
		}

		const defaultCentricEntity = category.defaultCentricEntity || undefined;

		const sqonQuery = convertSqonToQuery(filterOptions?.sqon);

		let recordsPaginated = await getSubmittedDataByCategoryIdAndOrganizationPaginated(
			categoryId,
			organization,
			paginationOptions,
			{
				sql: sqonQuery,
				entityNames: getEntityNamesFromFilterOptions(filterOptions, defaultCentricEntity),
			},
		);

		if (recordsPaginated.length === 0) {
			return fetchDataErrorResponse(PAGINATION_ERROR_MESSAGES.NO_DATA_FOUND);
		}

		if (filterOptions.view === VIEW_TYPE.Values.compound) {
			recordsPaginated = await convertRecordsToCompoundDocuments({
				dictionary: category.activeDictionary.dictionary,
				records: recordsPaginated,
				defaultCentricEntity: defaultCentricEntity,
			});
		}

		const totalRecords = await getTotalRecordsByCategoryIdAndOrganization(categoryId, organization, {
			sql: sqonQuery,
			entityNames: getEntityNamesFromFilterOptions(filterOptions, defaultCentricEntity),
		});

		logger.info(
			LOG_MODULE,
			`Retrieved '${recordsPaginated.length}' Submitted data on categoryId '${categoryId}' organization '${organization}'`,
		);

		return {
			result: recordsPaginated,
			metadata: {
				totalRecords,
			},
		};
	};

	/**
	 * Fetches submitted data from the database based on the specified category ID and system ID.
	 *
	 * This function retrieves the submitted data associated with a given `categoryId` and `systemId`.
	 * It supports a view representation defined by the `filterOptions`. The result includes both the
	 * fetched data and metadata, including an error message if applicable.
	 *
	 * @param categoryId - The ID of the category for which data is being fetched.
	 * @param systemId - The unique identifier for the system associated with the submitted data.
	 * @param filterOptions - An object containing options for data representation.
	 * @param filterOptions.view - The desired view type for the data representation, such as 'flat' or 'compound'.
	 * @returns A promise that resolves to an object containing:
	 * - `result`: The fetched `SubmittedDataResponse`, or `undefined` if no data is found.
	 * - `metadata`: An object containing metadata about the fetched data, including an optional `errorMessage` property.
	 */
	const getSubmittedDataBySystemId = async (
		categoryId: number,
		systemId: string,
		filterOptions: { view: ViewType },
	): Promise<{
		result: SubmittedDataResponse | undefined;
		metadata: { errorMessage?: string };
	}> => {
		// get SubmittedData by SystemId
		const foundRecord = await submittedDataRepo.getSubmittedDataBySystemId(systemId);
		logger.info(LOG_MODULE, `Found Submitted Data with system ID '${systemId}'`);

		if (!foundRecord) {
			return { result: undefined, metadata: { errorMessage: `No Submitted data found with systemId '${systemId}'` } };
		}

		if (foundRecord.dictionaryCategoryId !== categoryId) {
			return {
				result: undefined,
				metadata: { errorMessage: `Invalid Category ID '${categoryId}' for system ID '${systemId}'` },
			};
		}

		let recordResponse: SubmittedDataResponse = {
			data: foundRecord.data,
			entityName: foundRecord.entityName,
			isValid: foundRecord.isValid,
			organization: foundRecord.organization,
			systemId: foundRecord.systemId,
		};

		if (filterOptions.view === VIEW_TYPE.Values.compound) {
			const { getCategoryById } = categoryRepository(dependencies);

			const category = await getCategoryById(foundRecord.dictionaryCategoryId);

			if (!category?.activeDictionary) {
				return { result: undefined, metadata: { errorMessage: `Invalid Category ID` } };
			}

			const defaultCentricEntity = category.defaultCentricEntity || undefined;

			// Convert to compound records if the record matches the default centric entity type.
			// If no default centric entity is defined, the record's entity type will be used
			if (!defaultCentricEntity || defaultCentricEntity === foundRecord.entityName) {
				const [convertedRecord] = await convertRecordsToCompoundDocuments({
					dictionary: category.activeDictionary.dictionary,
					records: [recordResponse],
					defaultCentricEntity: defaultCentricEntity,
				});

				recordResponse = convertedRecord;
			}
		}

		return {
			result: recordResponse,
			metadata: {},
		};
	};

	/**
	 * Fetches submitted data from the database based on the specified category ID
	 *
	 * This async generator function retrieves the submitted data associated with a given `categoryId` and returns submitted data records as promises.
	 *
	 * @param categoryId - The ID of the category for which data is being fetched.
	 * @param filterOptions - An object containing options for data representation.
	 * @param filterOptions.view - The desired view type for the data representation, such as 'flat' or 'compound'.
	 * @param filterOptions.entityName - An optional array of entity names to filter the data by. Can include undefined entries.
	 * @param filterOptions.organization - An optional array of organizations to filter the data by. if not provided, no organization filter is applied.
	 * @returns Promise that resolves to an object containing submitted data records
	 */
	async function* getSubmittedDataByCategoryStream(
		categoryId: number,
		filterOptions: { entityName?: string[]; view: ViewType; organizations?: string[] },
	) {
		const { getSubmittedDataByCategoryIdPaginated, getTotalRecordsByCategoryId } = submittedDataRepo;

		const { getCategoryById } = categoryRepository(dependencies);

		const category = await getCategoryById(categoryId);

		if (!category?.activeDictionary) {
			return fetchDataErrorResponse(PAGINATION_ERROR_MESSAGES.INVALID_CATEGORY_ID);
		}

		const defaultCentricEntity = category.defaultCentricEntity || undefined;

		const PAGE_SIZE = 3;

		const totalRecords = await getTotalRecordsByCategoryId(categoryId, {
			entityNames: getEntityNamesFromFilterOptions(filterOptions, defaultCentricEntity),
			organizations: filterOptions.organizations,
		});

		for (let x = 0, currentPage = 1; x < totalRecords; currentPage++) {
			let submittedDataResponse = await getSubmittedDataByCategoryIdPaginated(
				categoryId,
				{
					page: currentPage,
					pageSize: PAGE_SIZE,
				},
				{
					entityNames: getEntityNamesFromFilterOptions(filterOptions, defaultCentricEntity),
					organizations: filterOptions.organizations,
				},
			);

			if (submittedDataResponse.length === 0) {
				return;
			}

			if (filterOptions.view === VIEW_TYPE.Values.compound) {
				submittedDataResponse = await convertRecordsToCompoundDocuments({
					dictionary: category.activeDictionary.dictionary,
					records: submittedDataResponse,
				});
			}

			for (const currentData of submittedDataResponse) {
				yield currentData;
			}
			x += submittedDataResponse.length;
		}

		return;
	}

	return {
		deleteSubmittedDataBySystemId,
		editSubmittedData,
		getSubmittedDataByCategory,
		getSubmittedDataByOrganization,
		getSubmittedDataBySystemId,
		getSubmittedDataByCategoryStream,
	};
};

export default submittedData;
