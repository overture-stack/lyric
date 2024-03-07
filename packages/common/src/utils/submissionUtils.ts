import { and, eq, or } from 'drizzle-orm';
import { isEmpty } from 'lodash-es';
import { Dependencies } from '../config/config.js';
import { NewSubmission, Submission, submissions } from '../models/submissions.js';
import submissionRepository from '../repository/activeSubmissionRepository.js';
import { BATCH_ERROR_TYPE, BatchError, CreateActiveSubmission, SUBMISSION_STATE, SubmissionEntity } from './types.js';

const utils = (dependencies: Dependencies) => {
	const LOG_MODULE = 'SUBMISSION_UTILS';
	const { logger } = dependencies;
	const submissionRepo = submissionRepository(dependencies);
	const _self = utils(dependencies);
	return {
		/**
		 * Creates a new Active Submission in database or update if already exists
		 * @param {Record<string, SubmissionEntity>} entityMap Map of Entities with Entity Types as keys
		 * @param {string} categoryId The category ID of the Submission
		 * @returns An Active Submission created or updated
		 */
		createOrUpdateActiveSubmission: async (
			entityMap: Record<string, SubmissionEntity>,
			categoryId: string,
			schemaErrors: any, // TODO: define Schema Errors type
			dictionaryId: number,
		): Promise<Submission> => {
			const foundOpenSubmission = await _self.getCurrentActiveSubmission(Number(categoryId));
			let updatedSubmission: Submission;
			if (!isEmpty(foundOpenSubmission)) {
				const { id, data } = foundOpenSubmission[0];
				const currentSubmissionId = Number(id);
				const currentData = data as Record<string, SubmissionEntity>;
				logger.debug(LOG_MODULE, `Found an Active submission`, JSON.stringify(currentData));

				// merge current active submission data
				const newData = { ...currentData, ...entityMap };

				// Update with new data
				foundOpenSubmission[0].data = newData;

				const updatedRecord = await submissionRepo.update(
					foundOpenSubmission[0],
					eq(submissions.id, currentSubmissionId),
				);
				updatedSubmission = updatedRecord[0];
				logger.info(
					LOG_MODULE,
					`Updated Active submission '${updatedSubmission.id}' for category '${updatedSubmission.dictionaryCategoryId}'`,
				);
			} else {
				const newSubmission: NewSubmission = {
					state: SUBMISSION_STATE.OPEN,
					dictionaryCategoryId: Number(categoryId),
					data: entityMap,
					errors: schemaErrors,
					dictionaryId: dictionaryId,
				};

				updatedSubmission = await submissionRepo.save(newSubmission);
				logger.info(LOG_MODULE, `Created a new Active submission for category '${categoryId}'`);
			}
			return updatedSubmission;
		},

		/**
		 * Gets the current 'open' active submission based on Category ID
		 * @param {number} categoryId A Category ID
		 * @returns An Active Submission
		 */
		getCurrentActiveSubmission: async (categoryId: number) => {
			return await submissionRepo.select(
				{},
				and(
					eq(submissions.dictionaryCategoryId, categoryId),
					or(eq(submissions.state, 'OPEN'), eq(submissions.state, 'VALID'), eq(submissions.state, 'INVALID')),
				),
			);
		},

		/**
		 *  Validate and convert an Array of Submission Entities into a Map
		 * @param {SubmissionEntity[]} entitiesArray
		 * @param {string[]} dictionarySchemaNames
		 * @returns A Map of SubmissionEntities
		 */
		mappingEntities: async (
			entitiesArray: SubmissionEntity[],
			dictionarySchemaNames: string[],
		): Promise<{ entityMap: Record<string, SubmissionEntity>; mappingError: Array<BatchError> }> => {
			const entityMap: Record<string, SubmissionEntity> = {};
			const mappingError: Array<BatchError> = [];

			//find duplicates
			for (const schemasNames of dictionarySchemaNames) {
				const filteredValidEntities = entitiesArray.filter(
					(entities) => entities.batchName.split('.')[0].toLowerCase() == schemasNames.toLowerCase(),
				);

				if (filteredValidEntities.length > 1) {
					logger.error(LOG_MODULE, `Duplicate schema name '${schemasNames}'`);
					mappingError.push({
						batchName: schemasNames,
						message: '',
						type: BATCH_ERROR_TYPE.MULTIPLE_TYPED_FILES,
					});
				} else if (filteredValidEntities.length == 1) {
					logger.info(LOG_MODULE, `Mapping schema name '${schemasNames}'`);
					entityMap[schemasNames] = filteredValidEntities[0];
				}
			}

			return {
				entityMap,
				mappingError,
			};
		},
	};
};

export const emptySubmission = () => {
	return {
		id: undefined,
		categoryId: '',
		entities: [],
		state: '',
		createdAt: undefined,
		createdBy: '',
	};
};
export const parseToResultSubmission = (submission: Submission): CreateActiveSubmission => {
	// TODO: map a Submission type to its equivalent CreateActiveSubmission
	return {
		id: submission.id.toString(),
		categoryId: submission.dictionaryCategoryId?.toString() || '',
		entities: submission.data,
		state: submission.state?.toString() || '',
		createdAt: submission.createdAt?.toISOString(),
		createdBy: '', // TODO: Auth not implemented yet.
	};
};

export default utils;
