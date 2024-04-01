import { SchemaValidationError, SchemasDictionary } from '@overturebio-stack/lectern-client/lib/schema-entities.js';
import { isEmpty } from 'lodash-es';

import { Submission } from 'src/models/submissions.js';
import { Dependencies } from '../config/config.js';
import submissionRepository from '../repository/activeSubmissionRepository.js';
import categoryRepository from '../repository/categoryRepository.js';
import { BadRequest, StateConflict } from '../utils/errors.js';
import { tsvToJson } from '../utils/fileUtils.js';
import submissionUtils from '../utils/submissionUtils.js';
import {
	BatchError,
	CREATE_SUBMISSION_STATE,
	CommitSubmissionResult,
	CreateSubmissionResult,
	CreateSubmissionState,
	SUBMISSION_STATE,
	SubmissionEntity,
	ValidateFilesParams,
} from '../utils/types.js';

const service = (dependencies: Dependencies) => {
	const LOG_MODULE = 'SUBMISSION_SERVICE';
	const { logger } = dependencies;

	const validateFilesAsync = async (files: Record<string, Express.Multer.File>, params: ValidateFilesParams) => {
		const { getActiveSubmissionByCategoryId } = submissionRepository(dependencies);
		const { createOrUpdateActiveSubmission, processSchemaValidation } = submissionUtils(dependencies);

		const { categoryId, currentDictionaryId, organization, schemasDictionary } = params;

		const activeSubmission = await getActiveSubmissionByCategoryId(categoryId);

		const submissionSchemaErrors: Record<string, SchemaValidationError[]> = {};
		const updateSubmissionEntities: Record<string, SubmissionEntity> = {};

		await Promise.all(
			Object.entries(files).map(async ([entityName, file]) => {
				logger.debug(LOG_MODULE, `Running validation for file '${file.originalname}' on entity '${entityName}'`);

				const parsedFileData = await tsvToJson(file.path);

				// TODO: merge existing data + new data for validation (Submitted data + active Submission +  tsv parsed Data)
				// Validating new data only! as we haven't found a reason yet to validate entire merged data set

				// step 3 Validation. Validate schema data (lectern-client processParallel)
				const { schemaErrors } = await processSchemaValidation(schemasDictionary, entityName, parsedFileData);
				if (schemaErrors.length > 0) {
					submissionSchemaErrors[entityName] = schemaErrors;
				}

				// To be stored in the submission data
				updateSubmissionEntities[entityName] = {
					batchName: file.originalname,
					creator: '', //TODO: get user from auth
					records: parsedFileData,
					dataErrors: schemaErrors,
				};
			}),
		);

		if (Object.keys(updateSubmissionEntities).length > 0) {
			await createOrUpdateActiveSubmission(
				activeSubmission?.id,
				updateSubmissionEntities,
				categoryId.toString(),
				submissionSchemaErrors,
				currentDictionaryId,
				'', // TODO: get User from auth.
				organization,
			);
		}
	};

	const performCommitSubmission = async (submission: Submission): Promise<CommitSubmissionResult> => {
		// TODO: get Submitted Data by categoryId
		// TODO: merge existing Submitted data with new submission
		// TODO: validate consolidatted Submission vs current schema
		// TODO: update DB

		return {
			status: '',
			dictionary: '',
			processedEntities: [],
			errors: [],
		};
	};

	return {
		/**
		 * Validates and Creates the Entities Schemas of the Active Submission and stores it in the database
		 * @param {Express.Multer.File[]} files An array of files
		 * @param {number} categoryId Category ID of the Submission
		 * @param {string} organization Organization name
		 * @returns The Active Submission created or Updated
		 */
		uploadSubmission: async (
			files: Express.Multer.File[],
			categoryId: number,
			organization: string,
		): Promise<CreateSubmissionResult> => {
			logger.info(LOG_MODULE, `Processing '${files.length}' files on category id '${categoryId}'`);
			const { checkFileNames, checkEntityFieldNames } = submissionUtils(dependencies);
			const { getActiveDictionaryByCategory } = categoryRepository(dependencies);

			const entitiesToProcess: string[] = [];
			const batchErrors: BatchError[] = [];

			if (files.length > 0) {
				const currentDictionary = await getActiveDictionaryByCategory(categoryId);
				if (isEmpty(currentDictionary)) throw new BadRequest(`Dictionary in category '${categoryId}' not found`);

				const schemasDictionary: SchemasDictionary = {
					name: currentDictionary.name,
					version: currentDictionary.version,
					schemas: currentDictionary.schemas,
				};

				// step 1 Validation. Validate entity type (filename matches dictionary entities, remove duplicates)
				const schemaNames: string[] = schemasDictionary.schemas.map((item) => item.name);
				const { validFileEntity, batchErrors: fileNamesErrors } = await checkFileNames(files, schemaNames);
				batchErrors.push(...fileNamesErrors);

				// step 2 Validation. Validate fieldNames (missing required fields based on schema)
				const { checkedEntities, fieldNameErrors } = await checkEntityFieldNames(schemasDictionary, validFileEntity);
				batchErrors.push(...fieldNameErrors);
				entitiesToProcess.push(...Object.keys(checkedEntities));

				if (!isEmpty(checkedEntities)) {
					// Running Schema validation in the background do not need to wait
					// Result of validations will be stored in database
					validateFilesAsync(checkedEntities, {
						categoryId,
						currentDictionaryId: currentDictionary.id,
						organization,
						schemasDictionary,
					});
				}
			}

			let state: CreateSubmissionState = CREATE_SUBMISSION_STATE.INVALID_SUBMISSION;
			let description: string = 'No valid files for submission';
			if (batchErrors.length === 0 && entitiesToProcess.length > 0) {
				state = CREATE_SUBMISSION_STATE.PROCESSING;
				description = 'Submission files are being processed';
			} else if (batchErrors.length > 0 && entitiesToProcess.length > 0) {
				state = CREATE_SUBMISSION_STATE.PARTIAL_SUBMISSION;
				description = 'Some Submission files are being processed while others were unable to process';
			}

			return {
				state,
				description,
				batchErrors,
				inProcessEntities: entitiesToProcess,
			};
		},

		activeSubmission: async (categoryId: number) => {
			const { getActiveSubmissionWithRelations } = submissionRepository(dependencies);

			return await getActiveSubmissionWithRelations(categoryId);
		},

		commitSubmission: async (categoryId: number, submissionId: number): Promise<CommitSubmissionResult> => {
			const { getSubmissionById } = submissionRepository(dependencies);

			const submission = await getSubmissionById(submissionId);
			if (isEmpty(submission)) throw new BadRequest(`Submission '${submissionId}' not found`);

			if (submission.dictionaryCategoryId !== categoryId)
				throw new BadRequest(`Category ID provided does not match the category for the Submission`);

			if (submission.state !== SUBMISSION_STATE.VALID)
				throw new StateConflict('Submission does not have state VALID and cannot be committed');

			return await performCommitSubmission(submission);
		},
	};
};

export default service;
