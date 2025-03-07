import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js';
import { and, count, eq, or } from 'drizzle-orm/sql';

import { NewSubmission, Submission, submissions } from '@overture-stack/lyric-data-model/models';

import { BaseDependencies } from '../config/config.js';
import { ServiceUnavailable } from '../utils/errors.js';
import {
	BooleanTrueObject,
	type PaginationOptions,
	SUBMISSION_STATUS,
	SubmissionSummaryRepository,
} from '../utils/types.js';

const repository = (dependencies: BaseDependencies) => {
	const LOG_MODULE = 'ACTIVE_SUBMISSION_REPOSITORY';
	const { db, logger } = dependencies;

	const getSubmissionColumns: BooleanTrueObject = {
		id: true,
		status: true,
		organization: true,
		data: true,
		errors: true,
		createdAt: true,
		createdBy: true,
		updatedAt: true,
		updatedBy: true,
	};

	const getSubmissionRelations: { [key: string]: { columns: BooleanTrueObject } } = {
		dictionary: {
			columns: {
				name: true,
				version: true,
			},
		},
		dictionaryCategory: {
			columns: {
				id: true,
				name: true,
			},
		},
	};

	const openSubmissionStatus = [SUBMISSION_STATUS.OPEN, SUBMISSION_STATUS.VALID, SUBMISSION_STATUS.INVALID] as const;

	const getActiveStatusesCondition = (onlyActive: boolean, activeStatuses: typeof openSubmissionStatus) => {
		return onlyActive ? or(...activeStatuses.map((status) => eq(submissions.status, status))) : undefined;
	};

	return {
		/**
		 * Save a new Active Submission in Database
		 * @param data An Active Submission object to be saved
		 * @returns The created Active Submission
		 */
		save: async (data: NewSubmission): Promise<Submission> => {
			try {
				const savedActiveSubmission = await db.insert(submissions).values(data).returning();
				logger.info(LOG_MODULE, `New Active Submission saved successfully`);
				return savedActiveSubmission[0];
			} catch (error) {
				logger.error(LOG_MODULE, `Failed saving Active Submission`, error);
				throw new ServiceUnavailable();
			}
		},

		/**
		 * Finds the current Active Submission by parameters
		 * @param {Object} params
		 * @param {number} params.categoryId Category ID
		 * @param {string} params.userName Name of the user
		 * @param {string} params.organization Organization name
		 * @returns
		 */
		getActiveSubmission: async ({
			categoryId,
			userName,
			organization,
		}: {
			categoryId: number;
			userName: string;
			organization: string;
		}): Promise<Submission | undefined> => {
			try {
				return await db.query.submissions.findFirst({
					where: and(
						eq(submissions.dictionaryCategoryId, categoryId),
						eq(submissions.createdBy, userName),
						eq(submissions.organization, organization),
						or(eq(submissions.status, 'OPEN'), eq(submissions.status, 'VALID'), eq(submissions.status, 'INVALID')),
					),
				});
			} catch (error) {
				logger.error(LOG_MODULE, `Failed getting active Submission`, error);
				throw new ServiceUnavailable();
			}
		},

		/**
		 * Finds a Submission by ID
		 * @param {number} submissionId Submission ID
		 * @returns The Submission found
		 */
		getSubmissionById: async (submissionId: number): Promise<Submission | undefined> => {
			try {
				return await db.query.submissions.findFirst({
					where: and(eq(submissions.id, submissionId)),
				});
			} catch (error) {
				logger.error(LOG_MODULE, `Failed getting Submission with id '${submissionId}'`, error);
				throw new ServiceUnavailable();
			}
		},

		/**
		 * Update a Submission record in database
		 * @param {number} submissionId Submission ID to update
		 * @param {Partial<Submission>} newData Set fields to update
		 * @param tx The transaction to use for the operation, optional
		 * @returns An updated record
		 */
		update: async (
			submissionId: number,
			newData: Partial<Submission>,
			tx?: PgTransaction<PostgresJsQueryResultHKT, Submission, ExtractTablesWithRelations<Submission>>,
		): Promise<Submission> => {
			try {
				const resultUpdate = await (tx || db)
					.update(submissions)
					.set({ ...newData, updatedAt: new Date() })
					.where(eq(submissions.id, submissionId))
					.returning();
				return resultUpdate[0];
			} catch (error) {
				logger.error(LOG_MODULE, `Failed updating Active Submission`, error);
				throw new ServiceUnavailable();
			}
		},

		/**
		 * Get Submissions by category
		 * @param {number} categoryId - Category ID
		 * @param {Object} paginationOptions - Pagination properties
		 * @param {number} paginationOptions.page - Page number
		 * @param {number} paginationOptions.pageSize - Items per page
		 * @param {Object} filterOptions
		 * @param {boolean} filterOptions.onlyActive - Filter by Active status
		 * @param {string} filterOptions.userName - Filter by creator's username
		 * @param {string} filterOptions.organization - Filter by Organization
		 * @returns One or many Active Submissions
		 */
		getSubmissionsWithRelationsByCategory: async (
			categoryId: number,
			paginationOptions: PaginationOptions,
			filterOptions: {
				onlyActive: boolean;
				userName: string;
				organization?: string;
			},
		): Promise<SubmissionSummaryRepository[] | undefined> => {
			const { page, pageSize } = paginationOptions;
			try {
				return await db.query.submissions.findMany({
					where: and(
						eq(submissions.dictionaryCategoryId, categoryId),
						eq(submissions.createdBy, filterOptions.userName),
						getActiveStatusesCondition(filterOptions.onlyActive, openSubmissionStatus),
						filterOptions.organization ? eq(submissions.organization, filterOptions.organization) : undefined,
					),
					columns: getSubmissionColumns,
					with: getSubmissionRelations,
					orderBy: (submissions, { desc }) => desc(submissions.createdAt),
					limit: pageSize,
					offset: (page - 1) * pageSize,
				});
			} catch (error) {
				logger.error(LOG_MODULE, `Failed querying Submissions by category with relations`, error);
				throw new ServiceUnavailable();
			}
		},

		/**
		 * Count Submissions by category ID
		 * @param {number} categoryId - Category ID
		 * @param {Object} filterOptions
		 * @param {boolean} filterOptions.onlyActive - Filter by Active status
		 * @param {string} filterOptions.userName - Filter by creator's username
		 * @param {string} filterOptions.organization - Filter by Organization
		 * @returns One or many Active Submissions
		 */
		getTotalSubmissionsByCategory: async (
			categoryId: number,
			filterOptions: {
				onlyActive: boolean;
				userName: string;
				organization?: string;
			},
		): Promise<number> => {
			try {
				const resultCount = await db
					.select({ total: count() })
					.from(submissions)
					.where(
						and(
							eq(submissions.dictionaryCategoryId, categoryId),
							eq(submissions.createdBy, filterOptions.userName),
							getActiveStatusesCondition(filterOptions.onlyActive, openSubmissionStatus),
							filterOptions.organization ? eq(submissions.organization, filterOptions.organization) : undefined,
						),
					);
				return resultCount[0].total;
			} catch (error) {
				logger.error(LOG_MODULE, `Failed counting Submission with categoryId '${categoryId}'`, error);
				throw new ServiceUnavailable();
			}
		},

		/**
		 * Get Active Submission by Organization
		 * @param {Object} filterParams
		 * @param {number} filterParams.categoryId Category ID
		 * @param {string} filterParams.userName User Name
		 * @param {string} filterParams.organization Organization name
		 * @returns One Active Submission
		 */
		getActiveSubmissionWithRelationsByOrganization: async ({
			categoryId,
			userName,
			organization,
		}: {
			categoryId: number;
			userName: string;
			organization: string;
		}): Promise<SubmissionSummaryRepository | undefined> => {
			try {
				return await db.query.submissions.findFirst({
					where: and(
						eq(submissions.dictionaryCategoryId, categoryId),
						eq(submissions.createdBy, userName),
						eq(submissions.organization, organization),
						or(eq(submissions.status, 'OPEN'), eq(submissions.status, 'VALID'), eq(submissions.status, 'INVALID')),
					),
					columns: getSubmissionColumns,
					with: getSubmissionRelations,
				});
			} catch (error) {
				logger.error(LOG_MODULE, `Failed querying Active Submission with relations`, error);
				throw new ServiceUnavailable();
			}
		},

		/**
		 * Get Submission by ID
		 * @param {number} submissionId Submission ID
		 * @returns A Submission
		 */
		getSubmissionWithRelationsById: async (submissionId: number): Promise<SubmissionSummaryRepository | undefined> => {
			try {
				return await db.query.submissions.findFirst({
					where: and(eq(submissions.id, submissionId)),
					columns: getSubmissionColumns,
					with: getSubmissionRelations,
				});
			} catch (error) {
				logger.error(LOG_MODULE, `Failed querying Submission with relations`, error);
				throw new ServiceUnavailable();
			}
		},
	};
};

export default repository;
