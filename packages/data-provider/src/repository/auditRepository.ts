import { and, count, eq, gt, lt, SQL } from 'drizzle-orm';

import { auditSubmittedData } from '@overture-stack/lyric-data-model';

import { BaseDependencies } from '../config/config.js';
import { convertToAuditEvent } from '../utils/auditUtils.js';
import { ServiceUnavailable } from '../utils/errors.js';
import { isEmptyString, isValidDateFormat } from '../utils/formatUtils.js';
import { AuditDataRepository, AuditFilterOptions, BooleanTrueObject } from '../utils/types.js';

const repository = (dependencies: BaseDependencies) => {
	const LOG_MODULE = 'AUDIT_REPOSITORY';
	const { db, logger } = dependencies;

	const paginatedColumns: BooleanTrueObject = {
		comment: true,
		entityName: true,
		action: true,
		newData: true,
		newDataIsValid: true,
		oldData: true,
		oldDataIsValid: true,
		organization: true,
		systemId: true,
		updatedAt: true,
		updatedBy: true,
	};

	const getOptionalFilter = ({
		entityName,
		eventType,
		endDate,
		startDate,
		systemId,
	}: {
		entityName: string;
		eventType: string;
		endDate: string;
		startDate: string;
		systemId: string;
	}): SQL<unknown>[] => {
		const filterArray: SQL[] = [];
		if (!isEmptyString(systemId)) {
			filterArray.push(eq(auditSubmittedData.systemId, systemId));
		}

		if (!isEmptyString(entityName)) {
			filterArray.push(eq(auditSubmittedData.entityName, entityName));
		}

		const eventEnum = convertToAuditEvent(eventType);
		if (eventEnum) {
			filterArray.push(eq(auditSubmittedData.action, eventEnum));
		}

		if (isValidDateFormat(endDate)) {
			filterArray.push(lt(auditSubmittedData.updatedAt, new Date(endDate)));
		}

		if (isValidDateFormat(startDate)) {
			filterArray.push(gt(auditSubmittedData.updatedAt, new Date(startDate)));
		}

		return filterArray;
	};

	return {
		/**
		 * Returns all the records found on the the Audit table matching the Category ID,
		 * Organization and additional filters
		 * @param {number} categoryId
		 * @param {string} organization
		 * @param {object} filterOptions
		 * @param {string} filterOptions.entityName
		 * @param {string} filterOptions.eventType
		 * @param {string} filterOptions.startDate
		 * @param {string} filterOptions.endDate
		 * @param {string} filterOptions.systemId
		 * @returns
		 */
		getRecordsByCategoryIdAndOrganizationPaginated: async (
			categoryId: number,
			organization: string,
			filterOptions: AuditFilterOptions,
		): Promise<AuditDataRepository[]> => {
			const { entityName, eventType, endDate, startDate, systemId, page, pageSize } = filterOptions;
			try {
				const optionalFilter = getOptionalFilter({
					entityName,
					eventType,
					endDate,
					startDate,
					systemId,
				});

				return await db.query.auditSubmittedData.findMany({
					where: and(
						eq(auditSubmittedData.dictionaryCategoryId, categoryId),
						eq(auditSubmittedData.organization, organization),
						...optionalFilter,
					),
					columns: paginatedColumns,
					orderBy: (auditSubmittedData, { asc }) => [asc(auditSubmittedData.updatedAt)],
					limit: pageSize,
					offset: (page - 1) * pageSize,
				});
			} catch (error) {
				logger.error(
					LOG_MODULE,
					`Failed querying Audit Records with categoryId '${categoryId}' organization '${organization}'`,
					error,
				);
				throw new ServiceUnavailable();
			}
		},

		/**
		 * Returns the total number of records found on the the Audit table matching the Category ID,
		 * Organization and additional filters
		 * @param {number} categoryId
		 * @param {string} organization
		 * @param {object} filterOptions
		 * @param {string} filterOptions.entityName
		 * @param {string} filterOptions.eventType
		 * @param {string} filterOptions.startDate
		 * @param {string} filterOptions.endDate
		 * @param {string} filterOptions.systemId
		 * @returns
		 */
		getTotalRecordsByCategoryIdAndOrganization: async (
			categoryId: number,
			organization: string,
			filterOptions: AuditFilterOptions,
		): Promise<number> => {
			const { entityName, eventType, endDate, startDate, systemId } = filterOptions;
			try {
				const optionalFilter = getOptionalFilter({
					entityName,
					eventType,
					endDate,
					startDate,
					systemId,
				});

				const resultCount = await db
					.select({ total: count() })
					.from(auditSubmittedData)
					.where(
						and(
							eq(auditSubmittedData.dictionaryCategoryId, categoryId),
							eq(auditSubmittedData.organization, organization),
							...optionalFilter,
						),
					);
				return resultCount[0].total;
			} catch (error) {
				logger.error(
					LOG_MODULE,
					`Failed counting Audit Records with categoryId '${categoryId}' organization '${organization}'`,
					error,
				);
				throw new ServiceUnavailable();
			}
		},
	};
};

export default repository;
