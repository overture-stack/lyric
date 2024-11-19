import * as _ from 'lodash-es';

import type { DataRecord, Dictionary as SchemasDictionary } from '@overture-stack/lectern-client';
import { SubmittedData } from '@overture-stack/lyric-data-model';
import { SQON } from '@overture-stack/sqon-builder';

import { BaseDependencies } from '../config/config.js';
import categoryRepository from '../repository/categoryRepository.js';
import submittedRepository from '../repository/submittedRepository.js';
import submissionService from '../services/submissionService.js';
import { convertSqonToQuery } from '../utils/convertSqonToQuery.js';
import {
	generateHierarchy,
	getDictionarySchemaRelations,
	SchemaChildNode,
	type TreeNode,
} from '../utils/dictionarySchemaRelations.js';
import {
	checkEntityFieldNames,
	checkFileNames,
	filterUpdatesFromDeletes,
	mergeRecords,
	pluralizeSchemaName,
} from '../utils/submissionUtils.js';
import {
	fetchDataErrorResponse,
	filterQueryByEntityName,
	getSchemaForCompound,
	groupByEntityName,
	mergeSubmittedDataAndDeduplicateById,
	transformmSubmittedDataToSubmissionDeleteData,
} from '../utils/submittedDataUtils.js';
import {
	type BatchError,
	CREATE_SUBMISSION_STATUS,
	type CreateSubmissionStatus,
	type DataRecordNested,
	ORDER_TYPE,
	PaginationOptions,
	SubmittedDataResponse,
	VIEW_TYPE,
	type ViewType,
} from '../utils/types.js';

const PAGINATION_ERROR_MESSAGES = {
	INVALID_CATEGORY_ID: 'Invalid Category ID',
	NO_DATA_FOUND: 'No Submitted data found',
} as const;

const service = (dependencies: BaseDependencies) => {
	const LOG_MODULE = 'SUBMITTED_DATA_SERVICE';
	const submittedDataRepo = submittedRepository(dependencies);
	const recordHierarchy = dependencies.features?.recordHierarchy;
	const { logger } = dependencies;

	const deleteSubmittedDataBySystemId = async (
		categoryId: number,
		systemId: string,
		userName: string,
	): Promise<{
		description: string;
		inProcessEntities: string[];
		status: CreateSubmissionStatus;
		submissionId?: string;
	}> => {
		const { getSubmittedDataBySystemId } = submittedDataRepo;
		const { getActiveDictionaryByCategory } = categoryRepository(dependencies);
		const { performDataValidation, getOrCreateActiveSubmission } = submissionService(dependencies);

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

		const submittedDataToDelete = [foundRecordToDelete, ...recordDependents];

		const recordsToDeleteMap = transformmSubmittedDataToSubmissionDeleteData(submittedDataToDelete);

		// Get Active Submission or Open a new one
		const activeSubmission = await getOrCreateActiveSubmission({
			categoryId: foundRecordToDelete.dictionaryCategoryId,
			userName,
			organization: foundRecordToDelete.organization,
		});

		// Merge current Active Submission delete entities
		const mergedSubmissionDeletes = mergeRecords(activeSubmission.data.deletes, recordsToDeleteMap);

		const entitiesToProcess = Object.keys(mergedSubmissionDeletes);

		// filter out update records found matching systemID on delete records
		const filteredUpdates = filterUpdatesFromDeletes(activeSubmission.data.updates ?? {}, mergedSubmissionDeletes);

		// Validate and update Active Submission
		performDataValidation({
			originalSubmission: activeSubmission,
			submissionData: {
				inserts: activeSubmission.data.inserts,
				updates: filteredUpdates,
				deletes: mergedSubmissionDeletes,
			},
			userName,
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
		files,
		organization,
		userName,
	}: {
		categoryId: number;
		files: Express.Multer.File[];
		organization: string;
		userName: string;
	}): Promise<{
		batchErrors: BatchError[];
		description?: string;
		inProcessEntities: string[];
		submissionId?: number;
		status: string;
	}> => {
		const { getActiveDictionaryByCategory } = categoryRepository(dependencies);
		const { processEditFilesAsync, getOrCreateActiveSubmission } = submissionService(dependencies);
		if (files.length === 0) {
			return {
				status: CREATE_SUBMISSION_STATUS.INVALID_SUBMISSION,
				description: 'No valid files for submission',
				batchErrors: [],
				inProcessEntities: [],
			};
		}

		const currentDictionary = await getActiveDictionaryByCategory(categoryId);

		if (_.isEmpty(currentDictionary)) {
			return {
				status: CREATE_SUBMISSION_STATUS.INVALID_SUBMISSION,
				description: `Dictionary in category '${categoryId}' not found`,
				batchErrors: [],
				inProcessEntities: [],
			};
		}

		const schemasDictionary: SchemasDictionary = {
			name: currentDictionary.name,
			version: currentDictionary.version,
			schemas: currentDictionary.schemas,
		};

		// step 1 Validation. Validate entity type (filename matches dictionary entities, remove duplicates)
		const schemaNames: string[] = schemasDictionary.schemas.map((item) => item.name);
		const { validFileEntity, batchErrors: fileNamesErrors } = await checkFileNames(files, schemaNames);

		// step 2 Validation. Validate fieldNames (missing required fields based on schema)
		const { checkedEntities, fieldNameErrors } = await checkEntityFieldNames(schemasDictionary, validFileEntity);

		const batchErrors = [...fileNamesErrors, ...fieldNameErrors];
		const entitiesToProcess = Object.keys(checkedEntities);

		if (_.isEmpty(checkedEntities)) {
			return {
				status: CREATE_SUBMISSION_STATUS.INVALID_SUBMISSION,
				description: 'No valid entities in submission',
				batchErrors,
				inProcessEntities: entitiesToProcess,
			};
		}

		// Get Active Submission or Open a new one
		const activeSubmission = await getOrCreateActiveSubmission({ categoryId, userName, organization });

		// Running Schema validation in the background do not need to wait
		// Result of validations will be stored in database
		processEditFilesAsync({
			submission: activeSubmission,
			files: checkedEntities,
			schemasDictionary,
			userName,
		});

		if (batchErrors.length === 0) {
			return {
				status: CREATE_SUBMISSION_STATUS.PROCESSING,
				description: 'Submission files are being processed',
				submissionId: activeSubmission.id,
				batchErrors,
				inProcessEntities: entitiesToProcess,
			};
		}

		return {
			status: CREATE_SUBMISSION_STATUS.PARTIAL_SUBMISSION,
			description: 'Some Submission files are being processed while others were unable to process',
			submissionId: activeSubmission.id,
			batchErrors,
			inProcessEntities: entitiesToProcess,
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
	 * @returns A promise that resolves to an object containing:
	 * - `result`: An array of `SubmittedDataResponse` objects, representing the fetched data.
	 * - `metadata`: An object containing metadata about the fetched data, including the total number of records.
	 *   If an error occurs during data retrieval, `metadata` will include an `errorMessage` property.
	 */
	const getSubmittedDataByCategory = async (
		categoryId: number,
		paginationOptions: PaginationOptions,
		filterOptions: { entityName?: (string | undefined)[]; view: ViewType },
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

		let recordsPaginated = await getSubmittedDataByCategoryIdPaginated(categoryId, paginationOptions, {
			entityNames: filterQueryByEntityName(filterOptions, category.defaultCentricEntity),
		});

		if (recordsPaginated.length === 0) {
			return fetchDataErrorResponse(PAGINATION_ERROR_MESSAGES.NO_DATA_FOUND);
		}

		if (filterOptions.view === VIEW_TYPE.Values.compound) {
			// get dictionary hierarchy structure
			const hierarchyStructureDesc = generateHierarchy(category.activeDictionary.dictionary, ORDER_TYPE.Values.desc);
			const hierarchyStructureAsc = generateHierarchy(category.activeDictionary.dictionary, ORDER_TYPE.Values.asc);

			recordsPaginated = await Promise.all(
				recordsPaginated.map(async (record) => {
					const childNodes = await traverseChildNodes({
						data: record.data,
						entityName: record.entityName,
						organization: record.organization,
						schemaCentric: getSchemaForCompound({
							filterByEntityName: filterOptions?.entityName,
							schemaCentricEntity: category.defaultCentricEntity,
							recordEntityName: record.entityName,
						}),
						treeNode: hierarchyStructureDesc,
					});

					const parentNodes = await traverseParentNodes({
						data: record.data,
						entityName: record.entityName,
						organization: record.organization,
						schemaCentric: getSchemaForCompound({
							filterByEntityName: filterOptions?.entityName,
							schemaCentricEntity: category.defaultCentricEntity,
							recordEntityName: record.entityName,
						}),
						treeNode: hierarchyStructureAsc,
					});

					record.data = { ...record.data, ...childNodes, ...parentNodes };
					return record;
				}),
			);
		}

		const totalRecords = await getTotalRecordsByCategoryId(categoryId, {
			entityNames: filterQueryByEntityName(filterOptions, category.defaultCentricEntity),
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
		filterOptions: { sqon?: SQON; entityName?: (string | undefined)[]; view: ViewType },
	): Promise<{ result: SubmittedDataResponse[]; metadata: { totalRecords: number; errorMessage?: string } }> => {
		const { getSubmittedDataByCategoryIdAndOrganizationPaginated, getTotalRecordsByCategoryIdAndOrganization } =
			submittedDataRepo;
		const { getCategoryById } = categoryRepository(dependencies);

		const category = await getCategoryById(categoryId);

		if (!category?.activeDictionary) {
			return fetchDataErrorResponse(PAGINATION_ERROR_MESSAGES.INVALID_CATEGORY_ID);
		}

		const sqonQuery = convertSqonToQuery(filterOptions?.sqon);

		let recordsPaginated = await getSubmittedDataByCategoryIdAndOrganizationPaginated(
			categoryId,
			organization,
			paginationOptions,
			{
				sql: sqonQuery,
				entityNames: filterQueryByEntityName(filterOptions, category.defaultCentricEntity),
			},
		);

		if (recordsPaginated.length === 0) {
			return fetchDataErrorResponse(PAGINATION_ERROR_MESSAGES.NO_DATA_FOUND);
		}

		if (filterOptions.view === VIEW_TYPE.Values.compound) {
			// get dictionary hierarchy structure
			const hierarchyStructureDesc = generateHierarchy(category.activeDictionary.dictionary, ORDER_TYPE.Values.desc);
			const hierarchyStructureAsc = generateHierarchy(category.activeDictionary.dictionary, ORDER_TYPE.Values.asc);

			recordsPaginated = await Promise.all(
				recordsPaginated.map(async (record) => {
					const childNodes = await traverseChildNodes({
						data: record.data,
						entityName: record.entityName,
						organization: record.organization,
						schemaCentric: getSchemaForCompound({
							filterByEntityName: filterOptions?.entityName,
							schemaCentricEntity: category.defaultCentricEntity,
							recordEntityName: record.entityName,
						}),
						treeNode: hierarchyStructureDesc,
					});

					const parentNodes = await traverseParentNodes({
						data: record.data,
						entityName: record.entityName,
						organization: record.organization,
						schemaCentric: getSchemaForCompound({
							filterByEntityName: filterOptions?.entityName,
							schemaCentricEntity: category.defaultCentricEntity,
							recordEntityName: record.entityName,
						}),
						treeNode: hierarchyStructureAsc,
					});

					record.data = { ...record.data, ...childNodes, ...parentNodes };
					return record;
				}),
			);
		}

		const totalRecords = await getTotalRecordsByCategoryIdAndOrganization(categoryId, organization, {
			sql: sqonQuery,
			entityNames: filterQueryByEntityName(filterOptions, category.defaultCentricEntity),
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

		let dataValue: DataRecordNested = foundRecord.data;

		if (filterOptions.view === VIEW_TYPE.Values.compound) {
			const { getCategoryById } = categoryRepository(dependencies);

			const category = await getCategoryById(foundRecord.dictionaryCategoryId);

			if (!category?.activeDictionary) {
				return { result: undefined, metadata: { errorMessage: `Invalid Category ID` } };
			}

			// Retrieve compound records only if the record matches the type of the default Centric Entity
			// or if no default Centric Entity is defined.
			if (
				!category.defaultCentricEntity ||
				(category.defaultCentricEntity && category.defaultCentricEntity === foundRecord.entityName)
			) {
				// get dictionary hierarchy structure
				const hierarchyStructureDesc = generateHierarchy(category.activeDictionary.dictionary, ORDER_TYPE.Values.desc);
				const hierarchyStructureAsc = generateHierarchy(category.activeDictionary.dictionary, ORDER_TYPE.Values.asc);

				const childNodes = await traverseChildNodes({
					data: foundRecord.data,
					entityName: foundRecord.entityName,
					organization: foundRecord.organization,
					schemaCentric: foundRecord.entityName,
					treeNode: hierarchyStructureDesc,
				});

				const parentNode = await traverseParentNodes({
					data: foundRecord.data,
					entityName: foundRecord.entityName,
					organization: foundRecord.organization,
					schemaCentric: foundRecord.entityName,
					treeNode: hierarchyStructureAsc,
				});

				dataValue = { ...dataValue, ...childNodes, ...parentNode };
			}
		}

		return {
			result: {
				data: dataValue,
				entityName: foundRecord.entityName,
				isValid: foundRecord.isValid,
				organization: foundRecord.organization,
				systemId: foundRecord.systemId,
			},
			metadata: {},
		};
	};

	/**
	 * Recursively traverses parent nodes of a schema tree and queries for related SubmittedData.
	 *
	 * This function takes in the current data record, entity name, organization, schema-centric information,
	 * and tree node structure, then filters and queries dependent records recursively, constructing a nested
	 * structure of related data.
	 *
	 * @param data - The current data record to traverse.
	 * @param entityName - The name of the entity (schema) associated with the current data.
	 * @param organization - The organization to which the data belongs.
	 * @param schemaCentric - The schema-centric identifier for filtering parent nodes.
	 * @param treeNode - The hierarchical structure representing schema relationships.
	 *
	 * @returns A promise that resolves to a nested `DataRecordNested` object, containing the traversed and filtered dependent data.
	 *          If no parent nodes or dependencies exist, it returns an empty object.
	 *
	 */
	const traverseParentNodes = async ({
		data,
		entityName,
		organization,
		schemaCentric,
		treeNode,
	}: {
		data: DataRecordNested;
		entityName: string;
		organization: string;
		schemaCentric: string;
		treeNode: TreeNode[];
	}): Promise<DataRecordNested> => {
		const { getSubmittedDataFiltered } = submittedDataRepo;

		const parentNode = treeNode.find((node) => node.schemaName === schemaCentric)?.parent;

		if (!parentNode || !parentNode.parentFieldName || !parentNode.schemaName) {
			// return empty array when no dependents for this record
			return {};
		}

		const filterData: { entityName: string; dataField: string; dataValue: string | undefined } = {
			entityName: parentNode.schemaName,
			dataField: parentNode.fieldName || '',
			dataValue: data[parentNode.parentFieldName!]?.toString() || '',
		};

		logger.debug(
			LOG_MODULE,
			`Entity '${entityName}' has following dependencies filter '${JSON.stringify(filterData)}'`,
		);

		const directDependants = await getSubmittedDataFiltered(organization, [filterData]);

		const groupedDependants = groupByEntityName(directDependants);

		const result: DataRecordNested = {};
		for (const [entityName, records] of Object.entries(groupedDependants)) {
			const additionalRecordsForEntity = await Promise.all(
				records.map(async (record) => {
					const additional = await traverseParentNodes({
						data: record.data,
						entityName: record.entityName,
						organization: record.organization,
						schemaCentric: record.entityName,
						treeNode,
					});
					return { ...record.data, ...additional };
				}),
			);

			// Getting the first record as record can have only 1 parent
			result[entityName] = additionalRecordsForEntity[0];
		}

		return result;
	};

	/**
	 * Recursively traverses child nodes of a schema tree and queries for related SubmittedData.
	 *
	 * This function takes in the current data record, entity name, organization, schema-centric information,
	 * and tree node structure, then filters and queries dependent records recursively, constructing a nested
	 * structure of related data.
	 *
	 * @param data - The current data record to traverse.
	 * @param entityName - The name of the entity (schema) associated with the current data.
	 * @param organization - The organization to which the data belongs.
	 * @param schemaCentric - The schema-centric identifier for filtering child nodes.
	 * @param treeNode - The hierarchical structure representing schema relationships.
	 *
	 * @returns A promise that resolves to a nested `DataRecordNested` object, containing the traversed and filtered dependent data.
	 *          If no child nodes or dependencies exist, it returns an empty object.
	 *
	 */
	const traverseChildNodes = async ({
		data,
		entityName,
		organization,
		schemaCentric,
		treeNode,
	}: {
		data: DataRecordNested;
		entityName: string;
		organization: string;
		schemaCentric: string;
		treeNode: TreeNode[];
	}): Promise<DataRecordNested> => {
		const { getSubmittedDataFiltered } = submittedDataRepo;

		const childNode = treeNode
			.find((node) => node.schemaName === schemaCentric)
			?.children?.filter((childNode) => childNode.parentFieldName && childNode.schemaName);

		if (!childNode || childNode.length === 0) {
			// return empty array when no dependents for this record
			return {};
		}

		const filterData: { entityName: string; dataField: string; dataValue: string | undefined }[] = childNode.map(
			(childNode) => ({
				entityName: childNode.schemaName,
				dataField: childNode.fieldName || '',
				dataValue: data[childNode.parentFieldName!]?.toString() || '',
			}),
		);

		logger.debug(
			LOG_MODULE,
			`Entity '${entityName}' has following dependencies filter '${JSON.stringify(filterData)}'`,
		);

		const directDependants = await getSubmittedDataFiltered(organization, filterData);

		const groupedDependants = groupByEntityName(directDependants);

		const result: DataRecordNested = {};
		for (const [entityName, records] of Object.entries(groupedDependants)) {
			// if enabled ensures that schema names are consistently pluralized
			const dependantKeyName = recordHierarchy?.pluralizeSchemasName ? pluralizeSchemaName(entityName) : entityName;

			const additionalRecordsForEntity = await Promise.all(
				records.map(async (record) => {
					const additional = await traverseChildNodes({
						data: record.data,
						entityName: record.entityName,
						organization: record.organization,
						schemaCentric: record.entityName,
						treeNode,
					});
					return { ...record.data, ...additional };
				}),
			);

			result[dependantKeyName] = additionalRecordsForEntity;
		}

		return result;
	};

	/**
	 * This function uses a dictionary children relations to query recursivaly
	 * to return all SubmittedData that relates
	 * @param input
	 * @param {DataRecord} input.data
	 * @param {Record<string, SchemaChildNode[]>} input.dictionaryRelations
	 * @param {string} input.entityName
	 * @param {string} input.organization
	 * @param {string} input.systemId
	 * @returns {Promise<SubmittedData[]>}
	 */
	const searchDirectDependents = async ({
		data,
		dictionaryRelations,
		entityName,
		organization,
		systemId,
	}: {
		data: DataRecord;
		dictionaryRelations: Record<string, SchemaChildNode[]>;
		entityName: string;
		organization: string;
		systemId: string;
	}): Promise<SubmittedData[]> => {
		const { getSubmittedDataFiltered } = submittedDataRepo;

		// Check if entity has children relationships
		if (Object.prototype.hasOwnProperty.call(dictionaryRelations, entityName)) {
			// Array that represents the children fields to filter

			const filterData: { entityName: string; dataField: string; dataValue: string | undefined }[] = Object.values(
				dictionaryRelations[entityName],
			)
				.filter((childNode) => childNode.parent?.fieldName)
				.map((childNode) => ({
					entityName: childNode.schemaName,
					dataField: childNode.fieldName,
					dataValue: data[childNode.parent!.fieldName]?.toString(),
				}));

			logger.debug(
				LOG_MODULE,
				`Entity '${entityName}' has following dependencies filter'${JSON.stringify(filterData)}'`,
			);

			const directDependents = await getSubmittedDataFiltered(organization, filterData);

			const additionalDepend = (
				await Promise.all(
					directDependents.map((record) =>
						searchDirectDependents({
							data: record.data,
							dictionaryRelations,
							entityName: record.entityName,
							organization: record.organization,
							systemId: record.systemId,
						}),
					),
				)
			).flatMap((item) => item);

			const uniqueDependents = mergeSubmittedDataAndDeduplicateById(directDependents, additionalDepend);

			logger.info(LOG_MODULE, `Found '${uniqueDependents.length}' records depending on system ID '${systemId}'`);

			return uniqueDependents;
		}

		// return empty array when no dependents for this record
		return [];
	};

	return {
		deleteSubmittedDataBySystemId,
		editSubmittedData,
		getSubmittedDataByCategory,
		getSubmittedDataByOrganization,
		getSubmittedDataBySystemId,
		searchDirectDependents,
	};
};

export default service;
