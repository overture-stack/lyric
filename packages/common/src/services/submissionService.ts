import {
	SchemaDefinition,
	SchemaValidationError,
	SchemasDictionary,
} from '@overturebio-stack/lectern-client/lib/schema-entities.js';
import { isEmpty } from 'lodash-es';
import { Dependencies } from '../config/config.js';
import dictionaryUtils from '../utils/dictionaryUtils.js';
import { tsvToJson } from '../utils/fileUtils.js';
import submissionUtils from '../utils/submissionUtils.js';
import { BatchError, CREATE_SUBMISSION_STATE, CreateSubmissionResult, SubmissionEntity } from '../utils/types.js';

const service = (dependencies: Dependencies) => {
	const LOG_MODULE = 'SUBMISSION_SERVICE';
	const { logger } = dependencies;
	return {
		/**
		 * Validates and Creates the Entities Schemas of the Active Submission and stores it in the database
		 * @param {Express.Multer.File[]} files An array of files
		 * @param {number} categoryId Category ID of the Submission
		 * @returns The Active Submission created or Updated
		 */
		uploadSubmission: async (files: Express.Multer.File[], categoryId: number): Promise<CreateSubmissionResult> => {
			logger.info(LOG_MODULE, `Processing '${files.length}' files on category id '${categoryId}'`);
			const { createOrUpdateActiveSubmission, checkFileNames, processSchemaValidation, checkEntityFieldNames } =
				submissionUtils(dependencies);
			const { getCurrentDictionary } = dictionaryUtils(dependencies);

			let entitiesToProcess: string[] = [];
			let batchErrors: BatchError[] = [];
			let submissionSchemaErrors: Record<string, SchemaValidationError[]> = {};
			let updateSubmissionEntities: Record<string, SubmissionEntity> = {};

			if (files.length > 0) {
				const currentDictionary = await getCurrentDictionary(categoryId);
				const schemasDictionary: SchemasDictionary = {
					name: currentDictionary.name,
					version: currentDictionary.version,
					schemas: currentDictionary.dictionary as SchemaDefinition[],
				};

				// step 1 Validation. Validate entity type (filename matches dictionary entities, remove duplicates)
				const schemaNames: string[] = schemasDictionary.schemas.map((item) => item.name);
				const { validFileEntity, batchErrors: fileNamesErrors } = await checkFileNames(files, schemaNames);
				batchErrors.push(...fileNamesErrors);

				// step 2 Validation. Validate fieldNames (missing required fields based on schema)
				const { checkedEntities, fieldNameErrors } = await checkEntityFieldNames(schemasDictionary, validFileEntity);
				batchErrors.push(...fieldNameErrors);
				entitiesToProcess = Object.keys(checkedEntities);

				if (!isEmpty(checkedEntities)) {
					// Running Schema validation in the background
					// Result of validations will be stored in database
					(async () => {
						await Promise.all(
							Object.entries(checkedEntities).map(async ([entityName, file]) => {
								logger.debug(
									LOG_MODULE,
									`Running validation for file '${file.originalname}' on entity '${entityName}'`,
								);

								const parsedData = await tsvToJson(file.path);

								// step 3 Validation. Validate schema data (lectern-client processParallel)
								const { schemaErrors } = await processSchemaValidation(schemasDictionary, entityName, parsedData);
								if (schemaErrors.length > 0) {
									submissionSchemaErrors[entityName] = schemaErrors;
								}

								// To be stored in the submission data
								updateSubmissionEntities[entityName] = {
									batchName: file.originalname,
									creator: '', //TODO: get user from auth
									records: parsedData,
									dataErrors: schemaErrors,
								};
							}),
						);

						if (Object.keys(updateSubmissionEntities).length > 0) {
							await createOrUpdateActiveSubmission(
								updateSubmissionEntities,
								categoryId.toString(),
								submissionSchemaErrors,
								currentDictionary.id,
								'', // TODO: get User from auth.
							);
						}
					})();
				}
			}

			let state = CREATE_SUBMISSION_STATE.INVALID_SUBMISSION;
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
	};
};

export default service;
