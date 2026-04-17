import { and, count, eq, gt, lt, SQL } from 'drizzle-orm';

import { auditSubmittedData } from '@overture-stack/lyric-data-model/models';

import { BaseDependencies } from '../config/config.js';
import { convertToAuditEvent } from '../utils/auditUtils.js';
import { ServiceUnavailable } from '../utils/errors.js';
import { isEmptyString, isValidDateFormat } from '../utils/formatUtils.js';
import { AuditFilterOptions, AuditRepositoryRecord, BooleanTrueObject } from '../utils/types.js';

const repository = (dependencies: BaseDependencies) => {
	const LOG_MODULE = 'AUDIT_REPOSITORY';
	const { db, logger } = dependencies;

	const paginatedColumns: BooleanTrueObject = {
		entityName: true,
		action: true,
		dataDiff: true,
		errors: true,
		newDataIsValid: true,
		oldDataIsValid: true,
		organization: true,
		submissionId: true,
		systemId: true,
		createdAt: true,
		createdBy: true,
	};

	const getOptionalFilter = ({
		entityName,
		eventType,
		endDate,
		newIsValid,
		organization,
		startDate,
		submissionId,
		systemId,
	}: {
		entityName?: string;
		eventType?: string;
		endDate?: string;
		newIsValid?: boolean;
		organization?: string;
		startDate?: string;
		submissionId?: number;
		systemId?: string;
	}): SQL<unknown>[] => {
		const filterArray: SQL[] = [];
		if (systemId && !isEmptyString(systemId)) {
			filterArray.push(eq(auditSubmittedData.systemId, systemId));
		}

		if (organization && !isEmptyString(organization)) {
			filterArray.push(eq(auditSubmittedData.organization, organization));
		}

		if (submissionId) {
			filterArray.push(eq(auditSubmittedData.submissionId, submissionId));
		}

		if (newIsValid !== undefined) {
			filterArray.push(eq(auditSubmittedData.newDataIsValid, newIsValid));
		}

		if (entityName && !isEmptyString(entityName)) {
			filterArray.push(eq(auditSubmittedData.entityName, entityName));
		}

		if (eventType && !isEmptyString(eventType)) {
			const eventEnum = convertToAuditEvent(eventType);
			if (eventEnum) {
				filterArray.push(eq(auditSubmittedData.action, eventEnum));
			}
		}

		if (endDate && isValidDateFormat(endDate)) {
			filterArray.push(lt(auditSubmittedData.createdAt, new Date(endDate)));
		}

		if (startDate && isValidDateFormat(startDate)) {
			filterArray.push(gt(auditSubmittedData.createdAt, new Date(startDate)));
		}

		return filterArray;
	};

	return {
		/**
		 * Returns all the records found on the the Audit table matching the Category ID,
		 * and additional filters
		 * @param {number} categoryId Category ID to filter the Audit records
		 * @param {object} filterOptions Additional filters and pagination options
		 * @returns
		 */
		getRecordsByCategoryIdAndOrganizationPaginated: async (
			categoryId: number,
			filterOptions: AuditFilterOptions,
		): Promise<AuditRepositoryRecord[]> => {
			const {
				endDate,
				entityName,
				eventType,
				newIsValid,
				organization,
				page,
				pageSize,
				startDate,
				submissionId,
				systemId,
			} = filterOptions;
			try {
				const optionalFilter = getOptionalFilter({
					endDate,
					entityName,
					eventType,
					newIsValid,
					organization,
					startDate,
					submissionId,
					systemId,
				});

				return await db.query.auditSubmittedData.findMany({
					where: and(eq(auditSubmittedData.dictionaryCategoryId, categoryId), ...optionalFilter),
					columns: paginatedColumns,
					orderBy: (auditSubmittedData, { asc }) => [asc(auditSubmittedData.createdAt)],
					limit: pageSize,
					offset: (page - 1) * pageSize,
				});
			} catch (error) {
				logger.error(LOG_MODULE, `Failed querying Audit Records with categoryId '${categoryId}'`, error);
				throw new ServiceUnavailable();
			}
		},

		/**
		 * Returns the total number of records found on the the Audit table matching the Category ID,
		 * and additional filters
		 * @param {number} categoryId Category ID to filter the Audit records
		 * @param {object} filterOptions Additional filters
		 * @returns
		 */
		getTotalRecordsByCategoryIdAndOrganization: async (
			categoryId: number,
			filterOptions: AuditFilterOptions,
		): Promise<number> => {
			const { entityName, eventType, endDate, startDate, systemId, organization, submissionId, newIsValid } =
				filterOptions;
			try {
				const optionalFilter = getOptionalFilter({
					endDate,
					entityName,
					eventType,
					newIsValid,
					organization,
					startDate,
					submissionId,
					systemId,
				});

				const resultCount = await db
					.select({ total: count() })
					.from(auditSubmittedData)
					.where(and(eq(auditSubmittedData.dictionaryCategoryId, categoryId), ...optionalFilter));
				return resultCount[0]?.total ?? 0;
			} catch (error) {
				logger.error(LOG_MODULE, `Failed counting Audit Records with categoryId '${categoryId}'`, error);
				throw new ServiceUnavailable();
			}
		},
	};
};

export default repository;
