import { SQL, and, count, eq } from 'drizzle-orm/sql';

import { NewSubmittedData, SubmittedData, submittedData } from 'data-model';
import { BaseDependencies } from '../config/config.js';
import { ServiceUnavailable } from '../utils/errors.js';
import { BooleanTrueObject, SubmittedDataRepository, paginationOps } from '../utils/types.js';

const repository = (dependencies: BaseDependencies) => {
	const LOG_MODULE = 'SUBMITTEDDATA_REPOSITORY';
	const { db, logger } = dependencies;

	const paginatedColumns: BooleanTrueObject = {
		entityName: true,
		data: true,
		organization: true,
		isValid: true,
	};
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
		 * Find SubmittedData by category ID and organization
		 * @param {number} categoryId Category ID
		 * @param {string} organization Organization Name
		 * @returns The SubmittedData found
		 */
		getSubmittedDataByCategoryIdAndOrganization: async (
			categoryId: number,
			organization: string,
		): Promise<SubmittedData[] | undefined> => {
			try {
				return await db.query.submittedData.findMany({
					where: and(eq(submittedData.dictionaryCategoryId, categoryId), eq(submittedData.organization, organization)),
				});
			} catch (error) {
				logger.error(LOG_MODULE, `Failed querying SubmittedData with categoryId '${categoryId}'`, error);
				throw new ServiceUnavailable();
			}
		},

		/**
		 * Find SubmittedData by category ID with pagination
		 * @param {number} categoryId Category ID
		 * @returns The SubmittedData found
		 */
		getSubmittedDataByCategoryIdPaginated: async (
			categoryId: number,
			paginationOps: paginationOps,
		): Promise<SubmittedDataRepository[] | undefined> => {
			const { page, pageSize } = paginationOps;
			try {
				return await db.query.submittedData.findMany({
					where: eq(submittedData.dictionaryCategoryId, categoryId),
					columns: paginatedColumns,
					orderBy: (submittedData, { asc }) => [asc(submittedData.entityName), asc(submittedData.id)],
					limit: pageSize,
					offset: (page - 1) * pageSize,
				});
			} catch (error) {
				logger.error(LOG_MODULE, `Failed querying SubmittedData with categoryId '${categoryId}'`, error);
				throw new ServiceUnavailable();
			}
		},

		/**
		 * Find SubmittedData by category ID and Organization with pagination
		 * @param {number} categoryId Category ID
		 * @param {string} organization Organization Name
		 * @param {SQL} filter Optional filter
		 * @param {paginationOps} paginationOps Pagination properties
		 * @returns The SubmittedData found
		 */
		getSubmittedDataByCategoryIdAndOrganizationPaginated: async (
			categoryId: number,
			organization: string,
			paginationOps: paginationOps,
			filter?: SQL,
		): Promise<SubmittedDataRepository[] | undefined> => {
			const { page, pageSize } = paginationOps;
			try {
				return await db.query.submittedData.findMany({
					where: and(
						eq(submittedData.dictionaryCategoryId, categoryId),
						eq(submittedData.organization, organization),
						filter || undefined,
					),
					columns: paginatedColumns,
					orderBy: (submittedData, { asc }) => [asc(submittedData.entityName), asc(submittedData.id)],
					limit: pageSize,
					offset: (page - 1) * pageSize,
				});
			} catch (error) {
				logger.error(
					LOG_MODULE,
					`Failed querying SubmittedData with categoryId '${categoryId}' organization '${organization}'`,
					error,
				);
				throw new ServiceUnavailable();
			}
		},

		/**
		 * Counts the total of records found by Category and Organization
		 * @param {number} categoryId Category ID
		 * @param {string} organization Organization Name
		 * @returns Total number of recourds
		 */
		getTotalRecordsByCategoryIdAndOrganization: async (
			categoryId: number,
			organization: string,
			filter?: SQL,
		): Promise<number> => {
			try {
				const resultCount = await db
					.select({ total: count() })
					.from(submittedData)
					.where(
						and(
							eq(submittedData.dictionaryCategoryId, categoryId),
							eq(submittedData.organization, organization),
							filter,
						),
					);
				return resultCount[0].total;
			} catch (error) {
				logger.error(
					LOG_MODULE,
					`Failed counting SubmittedData with categoryId '${categoryId}' organization '${organization}'`,
					error,
				);
				throw new ServiceUnavailable();
			}
		},

		/**
		 * Counts the total of records found by Category
		 * @param {number} categoryId Category ID
		 * @returns Total number of recourds
		 */
		getTotalRecordsByCategoryId: async (categoryId: number): Promise<number> => {
			try {
				const resultCount = await db
					.select({ total: count() })
					.from(submittedData)
					.where(eq(submittedData.dictionaryCategoryId, categoryId));
				return resultCount[0].total;
			} catch (error) {
				logger.error(LOG_MODULE, `Failed counting SubmittedData with categoryId '${categoryId}'`, error);
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
