import { TransactionRollbackError } from 'drizzle-orm';
import * as _ from 'lodash-es';

import type { Dictionary as SchemasDictionary } from '@overture-stack/lectern-client';
import type { SubmissionDeleteData, SubmissionRecord, SubmittedData } from '@overture-stack/lyric-data-model/models';
import { SQON } from '@overture-stack/sqon-builder';

import { BaseDependencies } from '../../config/config.js';
import categoryRepository from '../../repository/categoryRepository.js';
import createSubmissionFilesRepository from '../../repository/submissionFilesRepository.js';
import createSubmissionRecordsRepository from '../../repository/submissionRecordsRepository.js';
import submittedRepository from '../../repository/submittedRepository.js';
import type { RepositoryTransaction } from '../../repository/types.js';
import { convertSqonToQuery } from '../../utils/convertSqonToQuery.js';
import { getDictionarySchemaRelations } from '../../utils/dictionarySchemaRelations.js';
import { InternalServerError } from '../../utils/errors.js';
import { genericSubmissionFileName, getSizeInBytes } from '../../utils/fileUtils.js';
import type { PaginatedResult } from '../../utils/result.js';
import { type ReplacedStagedRecord, toEditStagingKey } from '../../utils/submissionRecordUtils.js';
import { fetchDataErrorResponse, getEntityNamesFromFilterOptions } from '../../utils/submittedDataUtils.js';
import {
	ACTIVE_SUBMISSION_STATUS,
	type ActiveSubmissionStatus,
	PaginationOptions,
	SubmittedDataResponse,
	VIEW_TYPE,
	type ViewType,
} from '../../utils/types.js';
import submissionProcessorFactory from '../submission/submissionProcessor.js';
import submissionService from '../submission/submissionService.js';
import searchDataRelations from './searchDataRelations.js';
import viewMode from './viewMode.js';

const PAGINATION_ERROR_MESSAGES = {
	INVALID_CATEGORY_ID: 'Invalid Category ID',
	NO_DATA_FOUND: 'No Submitted data found',
} as const;

const submittedData = (dependencies: BaseDependencies) => {
	const LOG_MODULE = 'SUBMITTED_DATA_SERVICE';
	const submittedDataRepo = submittedRepository(dependencies);
	const submissionProcessor = submissionProcessorFactory.create(dependencies);
	const submissionRecordsRepository = createSubmissionRecordsRepository(dependencies);
	const submissionFilesRepository = createSubmissionFilesRepository(dependencies);

	const { logger } = dependencies;
	const { convertRecordsToCompoundDocuments } = viewMode(dependencies);
	const { searchDirectDependents } = searchDataRelations(dependencies);

	/**
	 * Returns a sentence describing the staged changes a request replaced, starting with a space. Returns an empty string
	 * when nothing was replaced.
	 */
	const describeReplacedRecords = (replacedRecords: ReplacedStagedRecord[]): string =>
		replacedRecords.length === 0
			? ''
			: ` '${replacedRecords.length}' change(s) previously staged on the Active Submission, listed in 'replacedRecords', were removed from the submission and replaced by this request. Submitted data is not changed until the submission is committed.`;

	/**
	 * Saves the DELETE records staged by deleting a Submitted Data record by its systemId, in one generic
	 * `submission_files` row per affected entity. The DELETE of the record itself is the parent; the DELETEs of its
	 * dependents reference it through `parentRecord`.
	 *
	 * Returns the names of the entities that have records staged.
	 * @throws {ServiceUnavailable} when the files or records cannot be saved
	 * @throws {Error} when the parent DELETE is saved without an ID being returned
	 */
	const saveDeleteRecords = async (
		{
			consequenceRecords,
			parentRecord,
			submissionId,
		}: {
			consequenceRecords: { entityName: string; data: SubmissionDeleteData }[];
			parentRecord: { entityName: string; data: SubmissionDeleteData };
			submissionId: number;
		},
		tx: RepositoryTransaction<SubmissionRecord>,
	): Promise<string[]> => {
		const recordsByEntity = _.groupBy([parentRecord, ...consequenceRecords], (record) => record.entityName);

		const fileIdsByEntity = new Map<string, number>();
		for (const [entityName, entityRecords] of Object.entries(recordsByEntity)) {
			const savedFileId = await submissionFilesRepository.save(
				{
					entityName,
					fileName: genericSubmissionFileName(),
					fileSize: getSizeInBytes(JSON.stringify(entityRecords.map((record) => record.data))),
					submissionId,
				},
				tx,
			);
			fileIdsByEntity.set(entityName, savedFileId);
		}

		const getFileId = (entityName: string): number => {
			const fileId = fileIdsByEntity.get(entityName);
			if (fileId === undefined) {
				throw new Error(`No Submission File created for entity '${entityName}'`);
			}
			return fileId;
		};

		// The parent is saved on its own to get its ID before its consequence records reference it
		const [parentRecordId] = await submissionRecordsRepository.saveManyForFile(
			getFileId(parentRecord.entityName),
			[{ actionType: 'DELETE', data: parentRecord.data, state: 'RECEIVED', lineNumber: 1 }],
			tx,
		);
		if (parentRecordId === undefined) {
			throw new Error(`Failed to save the delete of system ID '${parentRecord.data.systemId}'`);
		}

		for (const [entityName, entityRecords] of Object.entries(_.groupBy(consequenceRecords, 'entityName'))) {
			// Line numbers continue after the parent in the parent's own file
			const firstLineNumber = entityName === parentRecord.entityName ? 2 : 1;
			await submissionRecordsRepository.saveManyForFile(
				getFileId(entityName),
				entityRecords.map((record, index) => ({
					actionType: 'DELETE',
					data: record.data,
					state: 'RECEIVED',
					lineNumber: firstLineNumber + index,
					parentRecord: parentRecordId,
				})),
				tx,
			);
		}

		return [...fileIdsByEntity.keys()];
	};

	/**
	 * Stages the deletion of a Submitted Data record and of the records that depend on it on the Active Submission,
	 * then queues the validation of the new version.
	 *
	 * The DELETE of the record is a parent edit record. The DELETEs of its dependents are staged as its consequence,
	 * referencing it through `parentRecord`, so removing or replacing it also removes them.
	 *
	 * Replacement and conflicts (see `resolveStagedEditReplacements`):
	 * - The DELETE replaces the parent edit already staged for the same systemId: an UPDATE, an `idFieldChange` UPDATE
	 *   with its consequences, or another DELETE with its dependents' DELETEs.
	 * - A DELETE of a record that already has a direct DELETE staged, or a DELETE staged as the consequence of another
	 *   parent, changes nothing.
	 * - A dependent that already has a DELETE staged is skipped.
	 * - The whole request is rejected when the record, or one of its dependents, is already staged with anything else
	 *   that the request does not replace.
	 *
	 * Staging is atomic: either the replacements and every record of the request are staged and the Submission's
	 * version is incremented, or nothing changes. Concurrent changes to the same Submission are applied one at a time.
	 * Validation runs in the background after staging.
	 *
	 * Returns, with status `PROCESSING`, the entities with records staged and the staged parent records the request
	 * replaced. When the request changes nothing, the Submission is left unchanged, no validation is queued, and both
	 * lists are empty. Returns status `INVALID_SUBMISSION`, with nothing staged, when the record is not found, belongs
	 * to another category, or the dictionary of the category is not found.
	 * @throws {StatusConflict} nothing from the request is staged when:
	 * - the Submission's status does not allow changes;
	 * - the request conflicts with the staged records. The error details list the conflicts as `{ conflicts }`.
	 * @throws {InternalServerError} when the Active Submission is not found while it is marked as changed, after it was
	 * found or created
	 * @throws {ServiceUnavailable} when the database cannot be read or written
	 * @throws {Error} when:
	 * - the parent DELETE is saved without an ID being returned;
	 * - the request conflicts with a staged consequence record whose parent record is not found.
	 */
	const deleteSubmittedDataBySystemId = async (
		categoryId: number,
		systemId: string,
		username: string,
	): Promise<{
		description: string;
		inProcessEntities: string[];
		replacedRecords: ReplacedStagedRecord[];
		status: ActiveSubmissionStatus;
		submissionId?: string;
	}> => {
		const { getSubmittedDataBySystemId } = submittedDataRepo;
		const { getActiveDictionaryByCategory } = categoryRepository(dependencies);
		const { getOrCreateActiveSubmission } = submissionService(dependencies);

		// get SubmittedData by SystemId
		const foundRecordToDelete = await getSubmittedDataBySystemId(systemId);

		if (!foundRecordToDelete) {
			return {
				status: ACTIVE_SUBMISSION_STATUS.INVALID_SUBMISSION,
				description: `No Submitted data found with systemId '${systemId}'`,
				inProcessEntities: [],
				replacedRecords: [],
			};
		}
		logger.info(LOG_MODULE, `Found Submitted Data with system ID '${systemId}'`);

		if (foundRecordToDelete.dictionaryCategoryId !== categoryId) {
			return {
				status: ACTIVE_SUBMISSION_STATUS.INVALID_SUBMISSION,
				description: `Invalid Category ID '${categoryId}' for system ID '${systemId}'`,
				inProcessEntities: [],
				replacedRecords: [],
			};
		}

		// get current dictionary
		const currentDictionary = await getActiveDictionaryByCategory(categoryId);

		if (!currentDictionary) {
			return {
				status: ACTIVE_SUBMISSION_STATUS.INVALID_SUBMISSION,
				description: `Dictionary not found`,
				inProcessEntities: [],
				replacedRecords: [],
			};
		}

		// get dictionary relations
		const dictionaryRelations = getDictionarySchemaRelations(currentDictionary.schemas);

		// Get Active Submission or Open a new one. A StatusConflict, thrown when the Submission's status does not allow
		// changes, is not caught so it reaches the caller
		let activeSubmissionId: number;
		try {
			activeSubmissionId = await getOrCreateActiveSubmission({
				categoryId: foundRecordToDelete.dictionaryCategoryId,
				username,
				organization: foundRecordToDelete.organization,
			});
		} catch (error) {
			if (error instanceof InternalServerError) {
				return {
					status: ACTIVE_SUBMISSION_STATUS.INVALID_SUBMISSION,
					description: error.message,
					inProcessEntities: [],
					replacedRecords: [],
				};
			}
			throw error;
		}

		// Finding dependents, replacing staged records, resolving conflicts and saving the records all run in one
		// transaction that starts with `markSubmissionAsChanged`. Its lock on the Submission row makes concurrent changes
		// to the same Submission apply one at a time. An InternalServerError thrown inside it is not caught, so it
		// reaches the caller
		let stagingResult: { inProcessEntities: string[]; replacedRecords: ReplacedStagedRecord[]; stagedVersion: number };
		try {
			stagingResult = await dependencies.db.transaction(async (tx) => {
				// Throws StatusConflict and rolls back if the Submission's status no longer allows changes. Locks the
				// Submission row until the transaction ends
				const newVersion = await submissionProcessor.markSubmissionAsChanged(activeSubmissionId, username, tx);

				const recordDependents = await searchDirectDependents({
					data: foundRecordToDelete.data,
					dictionaryRelations,
					entityName: foundRecordToDelete.entityName,
					organization: foundRecordToDelete.organization,
					systemId: foundRecordToDelete.systemId,
					tx,
				});
				logger.info(LOG_MODULE, `Found ${recordDependents.length} dependendencies on systemId '${systemId}'`);

				const toDeleteRecord = (record: SubmittedData): { entityName: string; data: SubmissionDeleteData } => ({
					entityName: record.entityName,
					data: {
						data: record.data,
						isValid: record.isValid,
						organization: record.organization,
						systemId: record.systemId,
					},
				});
				const dependentDeleteRecordsByKey = new Map(
					recordDependents.map((dependent) => [toEditStagingKey(dependent), toDeleteRecord(dependent)]),
				);

				// Throws StatusConflict and rolls back if the request conflicts with the staged records
				const { replacedRecords, editsToStage } = await submissionProcessor.replaceStagedParentEdits(
					{
						incomingEdits: [
							{
								entityName: foundRecordToDelete.entityName,
								systemId: foundRecordToDelete.systemId,
								actionType: 'DELETE',
								idFieldChange: false,
								consequences: recordDependents.map((dependent) => ({
									entityName: dependent.entityName,
									systemId: dependent.systemId,
									actionType: 'DELETE',
								})),
							},
						],
						submissionId: activeSubmissionId,
					},
					tx,
				);

				const [editToStage] = editsToStage;
				if (!editToStage) {
					if (replacedRecords.length === 0) {
						// The record already has a DELETE staged: roll back the status and version change
						tx.rollback();
					}
					return { inProcessEntities: [], replacedRecords, stagedVersion: newVersion };
				}

				const inProcessEntities = await saveDeleteRecords(
					{
						consequenceRecords: editToStage.consequences.flatMap((consequence) => {
							const dependentDeleteRecord = dependentDeleteRecordsByKey.get(toEditStagingKey(consequence));
							return dependentDeleteRecord ? [dependentDeleteRecord] : [];
						}),
						parentRecord: toDeleteRecord(foundRecordToDelete),
						submissionId: activeSubmissionId,
					},
					tx,
				);

				return { inProcessEntities, replacedRecords, stagedVersion: newVersion };
			});
		} catch (error) {
			if (error instanceof TransactionRollbackError) {
				logger.info(
					LOG_MODULE,
					`System ID '${systemId}' is already staged for deletion on Submission '${activeSubmissionId}'`,
				);
				return {
					status: ACTIVE_SUBMISSION_STATUS.PROCESSING,
					description: `The record with system ID '${systemId}' is already staged for deletion on the Active Submission. Nothing was changed.`,
					submissionId: activeSubmissionId.toString(),
					inProcessEntities: [],
					replacedRecords: [],
				};
			}
			throw error;
		}

		// Perform Schema Data validation of the staged version in a worker thread
		dependencies.workerPool.dataValidation({
			submissionId: activeSubmissionId,
			username,
			version: stagingResult.stagedVersion,
		});

		logger.info(
			LOG_MODULE,
			`Staged deletes on entities '${stagingResult.inProcessEntities.join(', ')}' on the Active Submission`,
		);

		return {
			status: ACTIVE_SUBMISSION_STATUS.PROCESSING,
			description: `Records are staged for deletion on the Active Submission and are being validated.${describeReplacedRecords(stagingResult.replacedRecords)}`,
			submissionId: activeSubmissionId.toString(),
			inProcessEntities: stagingResult.inProcessEntities,
			replacedRecords: stagingResult.replacedRecords,
		};
	};

	/**
	 * Stages edits of Submitted Data records of one entity on the Active Submission, then queues the validation of the
	 * new version. Staging completes before this returns; see `stageEditRecords` for the replacement and conflict rules.
	 *
	 * Returns status `PROCESSING` with the staged parent records the request replaced. Returns status
	 * `INVALID_SUBMISSION`, with nothing staged, when there are no records, or when the dictionary or the entity is not
	 * found.
	 * @throws {StatusConflict} nothing from the request is staged when:
	 * - the Submission's status does not allow changes;
	 * - the request conflicts with the staged records. The error details list the conflicts as `{ conflicts }`.
	 * @throws {BadRequest} when the Active Submission or its dictionary is not found while staging
	 * @throws {InternalServerError} when the Active Submission is not found while it is marked as changed, after it was
	 * found or created
	 * @throws {ServiceUnavailable} when the database cannot be read or written
	 * @throws {Error} when:
	 * - a saved parent UPDATE returns no ID;
	 * - an edit conflicts with a staged consequence record whose parent record is not found.
	 */
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
		replacedRecords: ReplacedStagedRecord[];
		submissionId?: number;
		status: string;
	}> => {
		logger.info(
			LOG_MODULE,
			`Processing '${records.length}' records on category id '${categoryId}' organization '${organization}'`,
		);
		const { getActiveDictionaryByCategory } = categoryRepository(dependencies);
		const { getOrCreateActiveSubmission } = submissionService(dependencies);
		const { stageEditRecords } = submissionProcessor;

		if (records.length === 0) {
			return {
				status: ACTIVE_SUBMISSION_STATUS.INVALID_SUBMISSION,
				description: 'No valid records provided.',
				replacedRecords: [],
			};
		}

		const currentDictionary = await getActiveDictionaryByCategory(categoryId);

		if (_.isEmpty(currentDictionary)) {
			return {
				status: ACTIVE_SUBMISSION_STATUS.INVALID_SUBMISSION,
				description: `Dictionary in category '${categoryId}' not found`,
				replacedRecords: [],
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
				status: ACTIVE_SUBMISSION_STATUS.INVALID_SUBMISSION,
				description: `Invalid entity name ${entityName} for submission`,
				replacedRecords: [],
			};
		}

		// Get Active Submission or Open a new one. A StatusConflict, thrown when the Submission's status does not allow
		// changes, is not caught so it reaches the caller
		let activeSubmissionId: number;
		try {
			activeSubmissionId = await getOrCreateActiveSubmission({ categoryId, username, organization });
		} catch (error) {
			if (error instanceof InternalServerError) {
				return {
					status: ACTIVE_SUBMISSION_STATUS.INVALID_SUBMISSION,
					description: error.message,
					replacedRecords: [],
				};
			}
			throw error;
		}

		// Staging completes before responding, so conflicts and replaced records can be returned. Validation of the
		// staged version runs in the background
		const { replacedRecords } = await stageEditRecords(records, {
			submissionId: activeSubmissionId,
			schema: entitySchema,
			username,
		});

		return {
			status: ACTIVE_SUBMISSION_STATUS.PROCESSING,
			description: `Edits are staged on the Active Submission and are being validated.${describeReplacedRecords(replacedRecords)}`,
			submissionId: activeSubmissionId,
			replacedRecords,
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
	): Promise<PaginatedResult<SubmittedDataResponse>> => {
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
	): Promise<PaginatedResult<SubmittedDataResponse>> => {
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

				if (convertedRecord) {
					recordResponse = convertedRecord;
				}
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
