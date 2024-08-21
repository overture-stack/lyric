import { and, count, eq, or, SQL, sql } from 'drizzle-orm/sql';

import {
	auditSubmittedData,
	type DataDiff,
	NewAuditSubmittedData,
	NewSubmittedData,
	SubmittedData,
	submittedData,
} from '@overture-stack/lyric-data-model';

import { BaseDependencies } from '../config/config.js';
import { ServiceUnavailable } from '../utils/errors.js';
import { AUDIT_ACTION, BooleanTrueObject, PaginationOptions, SubmittedDataResponse } from '../utils/types.js';

const repository = (dependencies: BaseDependencies) => {
	const LOG_MODULE = 'SUBMITTEDDATA_REPOSITORY';
	const { db, logger, features } = dependencies;

	const auditDeleteSubmittedData = async (input: {
		recordDeleted: SubmittedData;
		diff: DataDiff;
		submissionId: number;
		userName: string;
	}) => {
		const { recordDeleted, diff, submissionId, userName } = input;
		const newAudit: NewAuditSubmittedData = {
			action: AUDIT_ACTION.Values.DELETE,
			dictionaryCategoryId: recordDeleted.dictionaryCategoryId,
			entityName: recordDeleted.entityName,
			lastValidSchemaId: recordDeleted.lastValidSchemaId,
			newDataIsValid: false,
			dataDiff: diff,
			oldDataIsValid: recordDeleted.isValid,
			organization: recordDeleted.organization,
			originalSchemaId: recordDeleted.originalSchemaId,
			submissionId: submissionId,
			systemId: recordDeleted.systemId,
			createdAt: new Date(),
			createdBy: userName,
		};
		return await db.insert(auditSubmittedData).values(newAudit);
	};

	// Column name on the database used to build JSONB query
	const jsonbColumnName = submittedData.data.name;

	const paginatedColumns: BooleanTrueObject = {
		entityName: true,
		data: true,
		organization: true,
		isValid: true,
		systemId: true,
	};

	/**
	 * Build a SQL object to search submitted data by entity Name
	 * @param {string[] | undefined} entityNameArray
	 * @returns {SQL<unknown> | undefined}
	 */
	const filterByEntityNameArray = (entityNameArray?: (string | undefined)[]): SQL<unknown> | undefined => {
		if (Array.isArray(entityNameArray)) {
			return or(
				...entityNameArray
					.filter((entity) => entity !== undefined)
					.map((entity) => eq(submittedData.entityName, entity.trim())),
			);
		}
		return undefined;
	};

	return {
		/**
		 * Deletes a submitted data record by its system ID, logs the deletion, and optionally audits the deletion if auditing is enabled.
		 * @param params The parameters for the deletion operation.
		 * @param params.diff The difference between the old and new data, used for auditing
		 * @param params.submissionId The ID of the Submission associated with the record
		 * @param params.systemId The unique identifier of the record to delete
		 * @param params.userName The name of the user performing the deletion
		 * @returns The deleted record
		 */
		deleteBySystemId: async (params: { diff: DataDiff; submissionId: number; systemId: string; userName: string }) => {
			const { diff, systemId, submissionId, userName } = params;
			const deletedRecord = await db.delete(submittedData).where(eq(submittedData.systemId, systemId)).returning();
			logger.info(LOG_MODULE, `Deleting SubmittedData with system ID '${systemId}' succesfully`);

			if (features?.audit?.enabled) {
				await auditDeleteSubmittedData({ recordDeleted: deletedRecord[0], submissionId, diff, userName });
			}

			return deletedRecord;
		},

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
		 * Returns a list of all organizations found by category ID
		 * @param {number} categoryId
		 * @returns
		 */
		getAllOrganizationsByCategoryId: async (categoryId: number): Promise<string[]> => {
			try {
				const resultQuery = await db
					.selectDistinct({ organization: submittedData.organization })
					.from(submittedData)
					.where(eq(submittedData.dictionaryCategoryId, categoryId))
					.orderBy(submittedData.organization);

				return resultQuery.map((record) => record.organization);
			} catch (error) {
				logger.error(LOG_MODULE, `Failed querying SubmittedData with categoryId '${categoryId}'`, error);
				throw new ServiceUnavailable();
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
		 * @param {PaginationOptions} paginationOptions Pagination properties
		 * @returns The SubmittedData found
		 */
		getSubmittedDataByCategoryIdPaginated: async (
			categoryId: number,
			paginationOptions: PaginationOptions,
			filter?: { entityNames?: (string | undefined)[] },
		): Promise<SubmittedDataResponse[]> => {
			const { page, pageSize } = paginationOptions;

			const filterEntityNameSql = filterByEntityNameArray(filter?.entityNames);

			try {
				return await db.query.submittedData.findMany({
					where: and(eq(submittedData.dictionaryCategoryId, categoryId), filterEntityNameSql),
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
			filter?: { sql?: SQL; entityNames?: (string | undefined)[] },
		): Promise<SubmittedDataResponse[]> => {
			const { page, pageSize } = paginationOptions;

			const filterEntityNameSql = filterByEntityNameArray(filter?.entityNames);

			try {
				return await db.query.submittedData.findMany({
					where: and(
						eq(submittedData.dictionaryCategoryId, categoryId),
						eq(submittedData.organization, organization),
						filter?.sql,
						filterEntityNameSql,
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
		 * @param {object} filter Filter Options
		 * @param {SQL | undefined} filter.sql SQL command to filter
		 * @param {(string | undefined)[] | undefined} filter.entityNames Array of entity names to filter
		 * @returns Total number of recourds
		 */
		getTotalRecordsByCategoryIdAndOrganization: async (
			categoryId: number,
			organization: string,
			filter?: { sql?: SQL; entityNames?: (string | undefined)[] },
		): Promise<number> => {
			const filterEntityNameSql = filterByEntityNameArray(filter?.entityNames);

			try {
				const resultCount = await db
					.select({ total: count() })
					.from(submittedData)
					.where(
						and(
							eq(submittedData.dictionaryCategoryId, categoryId),
							eq(submittedData.organization, organization),
							filter?.sql,
							filterEntityNameSql,
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
		 * @param {object} filter Filter options
		 * @param {SQL | undefined} filter.sql SQL command
		 * @param {(string | undefined)[] | undefined} filter.entityNames Array of entity names to filter
		 * @returns Total number of recourds
		 */
		getTotalRecordsByCategoryId: async (
			categoryId: number,
			filter?: { sql?: SQL; entityNames?: (string | undefined)[] },
		): Promise<number> => {
			const filterEntityNameSql = filterByEntityNameArray(filter?.entityNames);
			try {
				const resultCount = await db
					.select({ total: count() })
					.from(submittedData)
					.where(and(eq(submittedData.dictionaryCategoryId, categoryId), filterEntityNameSql));
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

		/**
		 * Query to retrieve an unique SubmittedData record searching by System ID
		 * Returns a SubmittedData record if found. Otherwise returns undefined
		 * @param {string} systemId
		 * @returns {Promise<SubmittedData | undefined>}
		 */
		getSubmittedDataBySystemId: async (systemId: string): Promise<SubmittedData | undefined> => {
			try {
				return await db.query.submittedData.findFirst({
					where: eq(submittedData.systemId, systemId),
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
					where: and(or(...sqlDataFilter), eq(submittedData.organization, organization)),
				});
			} catch (error) {
				logger.error(LOG_MODULE, `Failed querying SubmittedData`, error);
				throw new ServiceUnavailable();
			}
		},
	};
};

export default repository;
