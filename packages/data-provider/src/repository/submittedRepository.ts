import { SQL, and, count, eq, inArray, isNull, or, sql } from 'drizzle-orm/sql';

import { NewSubmittedData, SubmittedData, submittedData } from 'data-model';
import { BaseDependencies } from '../config/config.js';
import { ServiceUnavailable } from '../utils/errors.js';
import { BooleanTrueObject, PaginationOptions, SubmittedDataResponse } from '../utils/types.js';

const repository = (dependencies: BaseDependencies) => {
	const LOG_MODULE = 'SUBMITTEDDATA_REPOSITORY';
	const { db, logger } = dependencies;

	// Column name on the database used to build JSONB query
	const jsonbColumnName = submittedData.data.name;

	const paginatedColumns: BooleanTrueObject = {
		entityName: true,
		data: true,
		organization: true,
		isValid: true,
		systemId: true,
	};

	// Adding softDelete filter as Drizzle currently doesn't support Soft-Delete option
	// Important: Make sure all Queries on this repository contains this filter
	const softDeleteFilter = isNull(submittedData.deletedAt);

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
		): Promise<SubmittedData[]> => {
			try {
				return await db.query.submittedData.findMany({
					where: and(
						eq(submittedData.dictionaryCategoryId, categoryId),
						eq(submittedData.organization, organization),
						softDeleteFilter,
					),
				});
			} catch (error) {
				logger.error(LOG_MODULE, `Failed querying SubmittedData with categoryId '${categoryId}'`, error);
				throw new ServiceUnavailable();
			}
		},

		/**
		 * Find SubmittedData by category ID with pagination
		 * @param {number} categoryId Category ID
		 * @param {PaginationOptions} paginationOptions Pagination properties
		 * @returns The SubmittedData found
		 */
		getSubmittedDataByCategoryIdPaginated: async (
			categoryId: number,
			paginationOptions: PaginationOptions,
		): Promise<SubmittedDataResponse[]> => {
			const { page, pageSize } = paginationOptions;
			try {
				return await db.query.submittedData.findMany({
					where: and(eq(submittedData.dictionaryCategoryId, categoryId), softDeleteFilter),
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
		 * @param {PaginationOptions} paginationOptions Pagination properties
		 * @returns The SubmittedData found
		 */
		getSubmittedDataByCategoryIdAndOrganizationPaginated: async (
			categoryId: number,
			organization: string,
			paginationOptions: PaginationOptions,
			filter?: SQL,
		): Promise<SubmittedDataResponse[]> => {
			const { page, pageSize } = paginationOptions;
			try {
				return await db.query.submittedData.findMany({
					where: and(
						eq(submittedData.dictionaryCategoryId, categoryId),
						eq(submittedData.organization, organization),
						softDeleteFilter,
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
							softDeleteFilter,
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
					.where(and(eq(submittedData.dictionaryCategoryId, categoryId), softDeleteFilter));
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
					.where(and(eq(submittedData.id, submittedDataId), softDeleteFilter))
					.returning();
				return updated[0];
			} catch (error) {
				logger.error(LOG_MODULE, `Failed updating SubmittedData`, error);
				throw new ServiceUnavailable();
			}
		},

		/**
		 * Update multiple SubmittedData records by internal IDs
		 * @param {number[]} submittedDataIds
		 * @param {Partial<SubmittedData[]>} newData
		 * @returns {Promise<SubmittedData[]>}
		 */
		updateMany: async (submittedDataIds: number[], newData: Partial<SubmittedData>): Promise<SubmittedData[]> => {
			try {
				return await db
					.update(submittedData)
					.set({ ...newData, updatedAt: new Date() })
					.where(and(inArray(submittedData.id, submittedDataIds), softDeleteFilter))
					.returning();
			} catch (error) {
				logger.error(LOG_MODULE, `Failed updating SubmittedData with ids ${submittedDataIds}`, error);
				throw new ServiceUnavailable();
			}
		},

		/**
		 * Query to retrieve an unique SubmittedData record searching by System ID
		 * Returns a SubmittedData record if found. Otherwise returns undefined
		 * @param {string} systemId
		 * @returns {Promise<SubmittedData | undefined>}
		 */
		getSubmittedDataBySystemId: async (systemId: string): Promise<SubmittedData | undefined> => {
			try {
				return await db.query.submittedData.findFirst({
					where: and(eq(submittedData.systemId, systemId), softDeleteFilter),
				});
			} catch (error) {
				logger.error(LOG_MODULE, `Failed querying SubmittedData by systemId '${systemId}'`, error);
				throw new ServiceUnavailable();
			}
		},

		/**
		 * Query to retrieve submitted data filtered by JSONB field on an organization
		 * Returns an array of SubmittedData records found or an empty array if there are no matching records
		 * @param {string} organization
		 * @param {Object} filterData
		 * @param {string} filterData.entityName
		 * @param {string} filterData.dataField
		 * @param {string} filterData.dataValue
		 * @returns {Promise<SubmittedData[]>}
		 */
		getSubmittedDataFiltered: async (
			organization: string,
			filterData: {
				entityName: string;
				dataField: string;
				dataValue: string;
			}[],
		): Promise<SubmittedData[]> => {
			const sqlDataFilter = filterData.map((filter) => {
				return and(
					sql.raw(`${jsonbColumnName} ->> '${filter.dataField}' IN ('${filter.dataValue}')`),
					eq(submittedData.entityName, filter.entityName),
				);
			});

			try {
				return await db.query.submittedData.findMany({
					where: and(or(...sqlDataFilter), eq(submittedData.organization, organization), softDeleteFilter),
				});
			} catch (error) {
				logger.error(LOG_MODULE, `Failed querying SubmittedData`, error);
				throw new ServiceUnavailable();
			}
		},
	};
};

export default repository;
