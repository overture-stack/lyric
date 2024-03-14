import { isEmpty } from 'lodash-es';
import { Dependencies } from '../config/config.js';
import dictionaryUtils from '../utils/dictionaryUtils.js';
import submissionUtils, { emptySubmission, parseToResultSubmission } from '../utils/submissionUtils.js';
import {
	BatchError,
	CreateActiveSubmission,
	CreateSubmissionResult,
	DictionaryData,
	SubmissionEntity,
} from '../utils/types.js';

const service = (dependencies: Dependencies) => {
	const LOG_MODULE = 'SUBMISSION_SERVICE';
	const { logger } = dependencies;
	return {
		/**
		 * Creates and validates the Entities Schemas of the Active Submission and stores it in the database
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
				`Processing '${submissionsEntities.length}' Submission entities on category '${categoryId}'`,
			);
			const { createOrUpdateActiveSubmission, mappingEntities } = submissionUtils(dependencies);
			const { getCurrentDictionary } = dictionaryUtils(dependencies);

			let resultSubmission: CreateActiveSubmission = emptySubmission();
			let batchErrors: BatchError[] = [];

			if (submissionsEntities.length > 0) {
				const currentDictionary = await getCurrentDictionary(categoryId);
				// TODO: map this dictionary field as a 'DictionaryData' type on Drizzle models
				// Dictionary data stores as a JSONB type in database
				const dictionaryData: DictionaryData[] = currentDictionary.dictionary as DictionaryData[];
				logger.debug(LOG_MODULE, `Parsed Dictionary data '${JSON.stringify(dictionaryData)}'`);

				const schemaNames: string[] = dictionaryData.map((item) => item.name);

				// TODO: Validation. Validation is not completed, it is scoped for following Sprint
				// step 1 validate entity type (filename). Push errors to batchErrors array
				const { entityMap, mappingError } = await mappingEntities(submissionsEntities, schemaNames);
				batchErrors.push(...mappingError);
				// TODO: step 2 validate fields (required fields against dictionary). Push errors to batchErrors array
				// TODO: step 3 validate data (lectern-client processParallel)

				if (!isEmpty(entityMap)) {
					// TODO: Run Schema validation to find schemaErrors. Assuming data has no errors
					const schemaErrors = null;

					let createdSubmission = await createOrUpdateActiveSubmission(
						entityMap,
						categoryId.toString(),
						schemaErrors,
						currentDictionary.id,
					);

					resultSubmission = parseToResultSubmission(createdSubmission);
				}
			}

			if (batchErrors.length > 0) {
				logger.debug(LOG_MODULE, 'Found some Errors processing this request', JSON.stringify(batchErrors));
			}

			return {
				successful: false, // TODO: false while validation is not complete
				batchErrors,
				submission: resultSubmission,
			};
		},
	};
};

export default service;
