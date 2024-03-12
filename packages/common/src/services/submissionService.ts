import {
	SchemaDefinition,
	SchemaValidationError,
	SchemasDictionary,
} from '@overturebio-stack/lectern-client/lib/schema-entities.js';
import { isEmpty } from 'lodash-es';
import { Dependencies } from '../config/config.js';
import dictionaryUtils from '../utils/dictionaryUtils.js';
import submissionUtils, { parseToResultSubmission } from '../utils/submissionUtils.js';
import { BatchError, CreateSubmissionResult, SubmissionEntity } from '../utils/types.js';

const service = (dependencies: Dependencies) => {
	const LOG_MODULE = 'SUBMISSION_SERVICE';
	const { logger } = dependencies;
	return {
		/**
		 * Validates and Creates the Entities Schemas of the Active Submission and stores it in the database
		 * @param {SubmissionEntity[]} submissionsEntities An array of Entities within the Submission
		 * @param {number} categoryId Category ID of the Submission
		 * @returns The Active Submission created or Updated
		 */
		uploadSubmission: async (
			submissionsEntities: SubmissionEntity[],
			categoryId: number,
		): Promise<CreateSubmissionResult> => {
			logger.info(
				LOG_MODULE,
				`Processing '${submissionsEntities.length}' Submission entities on category id '${categoryId}'`,
			);
			const { createOrUpdateActiveSubmission, mappingEntities, processSchemaValidation, checkEntityFieldNames } =
				submissionUtils(dependencies);
			const { getCurrentDictionary } = dictionaryUtils(dependencies);

			let resultSubmission = parseToResultSubmission();
			let batchErrors: BatchError[] = [];
			let submissionSchemaErrors: Record<string, SchemaValidationError[]> = {};
			let updateSubmissionEntities: Record<string, SubmissionEntity> = {};

			if (submissionsEntities.length > 0) {
				const currentDictionary = await getCurrentDictionary(categoryId);
				const schemasDictionary: SchemasDictionary = {
					name: currentDictionary.name,
					version: currentDictionary.version,
					schemas: currentDictionary.dictionary as SchemaDefinition[],
				};
				const schemaNames: string[] = schemasDictionary.schemas.map((item) => item.name);

				// step 1 Validation. Validate entity type (filename matches dictionary entities, remove duplicates)
				const { entityMap, mappingError } = await mappingEntities(submissionsEntities, schemaNames);
				batchErrors.push(...mappingError);
				// step 2 Validation. Validate fieldNames (missing required fields based on schema)
				const { checkedEntities, fieldNameErrors } = await checkEntityFieldNames(schemasDictionary, entityMap);
				batchErrors.push(...fieldNameErrors);

				if (!isEmpty(checkedEntities)) {
					await Promise.all(
						Object.entries(checkedEntities).map(async ([entityName, entityData]) => {
							logger.debug(
								LOG_MODULE,
								`Running validation for entity '${entityName}' containing '${entityData.records.length}' records`,
							);
							// step 3 Validation. Validate schema data (lectern-client processParallel)
							const { schemaErrors } = await processSchemaValidation(schemasDictionary, entityName, entityData.records);
							if (schemaErrors.length > 0) {
								submissionSchemaErrors[entityName] = schemaErrors;
							} else {
								updateSubmissionEntities[entityName] = { ...entityData };
							}
						}),
					);

					if (Object.keys(updateSubmissionEntities).length > 0) {
						let createdSubmission = await createOrUpdateActiveSubmission(
							updateSubmissionEntities,
							categoryId.toString(),
							[],
							currentDictionary.id,
							'', // TODO: get User from auth.
						);
						resultSubmission = parseToResultSubmission(createdSubmission);
					}
				}
			}

			// Put Schema Errors in each Entity
			for (const entityName in submissionSchemaErrors) {
				resultSubmission.entities[entityName] = {} as any;
				resultSubmission.entities[entityName].dataErrors = submissionSchemaErrors[entityName];
			}

			return {
				successful:
					batchErrors.length === 0 &&
					Object.keys(submissionSchemaErrors).length === 0 &&
					Object.keys(resultSubmission.entities).length > 0,
				batchErrors,
				submission: resultSubmission,
			};
		},
	};
};

export default service;
