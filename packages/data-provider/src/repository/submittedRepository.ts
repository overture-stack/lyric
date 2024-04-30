import { eq } from 'drizzle-orm/sql';

import { NewSubmittedData, SubmittedData, submittedData } from 'data-model';
import { Dependencies } from '../config/config.js';
import { ServiceUnavailable } from '../utils/errors.js';

const repository = (dependencies: Dependencies) => {
	const LOG_MODULE = 'SUBMITTEDDATA_REPOSITORY';
	const { db, logger } = dependencies;
	return {
		/**
		 * Save new SubmittedData in Database
		 * @param data A SubmittedData object to be saved
		 * @returns The created SubmittedData
		 */
		save: async (data: NewSubmittedData): Promise<SubmittedData> => {
			try {
				const savedSubmittedData = await db.insert(submittedData).values(data).returning();
				logger.info(
					LOG_MODULE,
					`Submitting Data with entity name '${data.entityName}' on category '${data.dictionaryCategoryId}' saved successfully`,
				);
				return savedSubmittedData[0];
			} catch (error) {
				logger.error(
					LOG_MODULE,
					`Failed Submitted Data with entity name '${data.entityName}' on category '${data.dictionaryCategoryId}'`,
					error,
				);
				throw error;
			}
		},

		/**
		 * Find SubmittedData by category ID
		 * @param {number} categoryId Category ID
		 * @returns The SubmittedData found
		 */
		getSubmittedDataByCategoryId: async (categoryId: number): Promise<SubmittedData[] | undefined> => {
			try {
				return await db.query.submittedData.findMany({
					where: eq(submittedData.dictionaryCategoryId, categoryId),
				});
			} catch (error) {
				logger.error(LOG_MODULE, `Failed querying SubmittedData with categoryId '${categoryId}'`, error);
				throw new ServiceUnavailable();
			}
		},

		/**
		 * Update a SubmittedData record in database
		 * @param submittedDataId Submitted Data ID
		 * @param newData Set fields to update
		 * @returns An updated record
		 */
		update: async (submittedDataId: number, newData: Partial<SubmittedData>): Promise<SubmittedData> => {
			try {
				const updated = await db
					.update(submittedData)
					.set({ ...newData, updatedAt: new Date() })
					.where(eq(submittedData.id, submittedDataId))
					.returning();
				return updated[0];
			} catch (error) {
				logger.error(LOG_MODULE, `Failed updating SubmittedData`, error);
				throw new ServiceUnavailable();
			}
		},
	};
};

export default repository;
