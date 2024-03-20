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
		 * @param {string} organization Organization name
		 * @returns The Active Submission created or Updated
		 */
		uploadSubmission: async (
			files: Express.Multer.File[],
			categoryId: number,
			organization: string,
		): Promise<CreateSubmissionResult> => {
			logger.info(LOG_MODULE, `Processing '${files.length}' files on category id '${categoryId}'`);
			const {
				createOrUpdateActiveSubmission,
				checkFileNames,
				processSchemaValidation,
				checkEntityFieldNames,
				getCurrentActiveSubmission,
			} = submissionUtils(dependencies);
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
					// Running Schema validation in the background do not need to wait
					// Result of validations will be stored in database
					(async () => {
						const activeSubmission = await getCurrentActiveSubmission(categoryId);
						let idActiveSubmission;
						let activeSubmissionData: Record<string, SubmissionEntity> = {};
						if (activeSubmission.length > 0 && !isEmpty(activeSubmission[0])) {
							idActiveSubmission = activeSubmission[0].id;
							activeSubmissionData = activeSubmission[0].data as Record<string, SubmissionEntity>;
						}

						await Promise.all(
							Object.entries(checkedEntities).map(async ([entityName, file]) => {
								logger.debug(
									LOG_MODULE,
									`Running validation for file '${file.originalname}' on entity '${entityName}'`,
								);

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
								idActiveSubmission,
								updateSubmissionEntities,
								categoryId.toString(),
								submissionSchemaErrors,
								currentDictionary.id,
								'', // TODO: get User from auth.
								organization,
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

		activeSubmission: async (categoryId: number) => {
			const { getCurrentActiveSubmissionWithRelations } = submissionUtils(dependencies);

			return await getCurrentActiveSubmissionWithRelations(categoryId);
		},
	};
};

export default service;
