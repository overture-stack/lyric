import type { ExtractTablesWithRelations, SQL } from 'drizzle-orm';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js';
import { and, count, eq, inArray, or, sql } from 'drizzle-orm/sql';
import * as _ from 'lodash-es';

import { NewSubmission, Submission, submissions } from '@overture-stack/lyric-data-model/models';

import { BaseDependencies } from '../config/config.js';
import { ServiceUnavailable } from '../utils/errors.js';
import { openSubmissionStatus } from '../utils/submissionUtils.js';
import type {
	BooleanTrueObject,
	PaginationOptions,
	SubmissionDataSummary,
	SubmissionErrorsSummary,
	SubmissionRepositoryRecord,
	SubmissionSummaryRepositoryRecord,
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

	const getSubmissionColumnsSummary = _.omit(getSubmissionColumns, ['data', 'errors']);

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

	/**
	 * A query to generate a summarized JSON object of the 'data' column
	 * Returns a JSON object of type SubmissionDataSummary
	 */
	const dataSummaryQuery = sql<SubmissionDataSummary>`
jsonb_build_object(
  'inserts',
    (
      SELECT jsonb_object_agg(
        i.key,
        jsonb_build_object(
          'batchName', i.value->>'batchName',
          'recordsCount',
            CASE
              WHEN jsonb_typeof(i.value->'records') = 'array'
              THEN jsonb_array_length(i.value->'records')
              ELSE 0
            END
        )
      )
      FROM jsonb_each(${submissions.data}->'inserts') AS i(key, value)
    ),

  'updates',
    (
      SELECT jsonb_object_agg(
        u.key,
        jsonb_build_object(
          'recordsCount',
            CASE
              WHEN jsonb_typeof(u.value) = 'array'
              THEN jsonb_array_length(u.value)
              ELSE 0
            END
        )
      )
      FROM jsonb_each(${submissions.data}->'updates') AS u(key, value)
    ),

  'deletes',
    (
      SELECT jsonb_object_agg(
        d.key,
        jsonb_build_object(
          'recordsCount',
            CASE
              WHEN jsonb_typeof(d.value) = 'array'
              THEN jsonb_array_length(d.value)
              ELSE 0
            END
        )
      )
      FROM jsonb_each(${submissions.data}->'deletes') AS d(key, value)
    )
)`.as('data');

	/**
	 * A query to generate a summarized JSON object of the 'errors' column
	 * Returns a json object of type SubmissionErrorsSummary
	 */
	const errorsSummaryQuery = sql<SubmissionErrorsSummary>`jsonb_build_object(
  'inserts',
    (
      SELECT jsonb_object_agg(
        i.key,
        jsonb_build_object(
          'recordsCount',
            CASE
              WHEN jsonb_typeof(i.value) = 'array'
              THEN jsonb_array_length(i.value)
              ELSE 0
            END
        )
      )
      FROM jsonb_each(${submissions.errors}->'inserts') AS i(key, value)
    ),

  'updates',
    (
      SELECT jsonb_object_agg(
        u.key,
        jsonb_build_object(
          'recordsCount',
            CASE
              WHEN jsonb_typeof(u.value) = 'array'
              THEN jsonb_array_length(u.value)
              ELSE 0
            END
        )
      )
      FROM jsonb_each(${submissions.errors}->'updates') AS u(key, value)
    ),

  'deletes',
    (
      SELECT jsonb_object_agg(
        d.key,
        jsonb_build_object(
          'recordsCount',
            CASE
              WHEN jsonb_typeof(d.value) = 'array'
              THEN jsonb_array_length(d.value)
              ELSE 0
            END
        )
      )
      FROM jsonb_each(${submissions.errors}->'deletes') AS d(key, value)
    )
)`.as('errors');

	/**
	 * SQL condition used to filter submissions that are in an active state.
	 * Example usage:
	 * ```ts
	 * where: and(
	 *   eq(submissions.dictionaryCategoryId, categoryId),
	 *   activeStatusesCondition,
	 * )
	 * ```
	 */
	const activeStatusesCondition: SQL = inArray(submissions.status, [...openSubmissionStatus]);

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
		 * @param {string} params.username Name of the user
		 * @param {string} params.organization Organization name
		 * @returns
		 */
		getActiveSubmission: async ({
			categoryId,
			username,
			organization,
		}: {
			categoryId: number;
			username: string;
			organization: string;
		}): Promise<Submission | undefined> => {
			try {
				return await db.query.submissions.findFirst({
					where: and(
						eq(submissions.dictionaryCategoryId, categoryId),
						eq(submissions.createdBy, username),
						eq(submissions.organization, organization),
						activeStatusesCondition,
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
		 * @param {string} filterOptions.username - Filter by creator's username
		 * @param {string} filterOptions.organization - Filter by Organization
		 * @returns One or many Active Submissions
		 */
		getSubmissionsSummaryWithRelationsByCategory: async (
			categoryId: number,
			paginationOptions: PaginationOptions,
			filterOptions: {
				onlyActive: boolean;
				username?: string;
				organization?: string;
			},
		): Promise<SubmissionSummaryRepositoryRecord[] | undefined> => {
			const { page, pageSize } = paginationOptions;
			try {
				return await db.query.submissions.findMany({
					where: and(
						eq(submissions.dictionaryCategoryId, categoryId),
						filterOptions.username ? eq(submissions.createdBy, filterOptions.username) : undefined,
						filterOptions.onlyActive ? activeStatusesCondition : undefined,
						filterOptions.organization ? eq(submissions.organization, filterOptions.organization) : undefined,
					),
					columns: getSubmissionColumnsSummary,
					extras: { data: dataSummaryQuery, errors: errorsSummaryQuery },
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
		 * @param {string} filterOptions.username - Filter by creator's username
		 * @param {string} filterOptions.organization - Filter by Organization
		 * @returns One or many Active Submissions
		 */
		getTotalSubmissionsByCategory: async (
			categoryId: number,
			filterOptions: {
				onlyActive: boolean;
				username?: string;
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
							filterOptions.username ? eq(submissions.createdBy, filterOptions.username) : undefined,
							filterOptions.onlyActive ? activeStatusesCondition : undefined,
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
		 * @param {string} filterParams.username User Name
		 * @param {string} filterParams.organization Organization name
		 * @returns One Active Submission
		 */
		getActiveSubmissionWithRelationsByOrganization: async ({
			categoryId,
			username,
			organization,
		}: {
			categoryId: number;
			username: string;
			organization: string;
		}): Promise<SubmissionSummaryRepositoryRecord | undefined> => {
			try {
				return await db.query.submissions.findFirst({
					where: and(
						eq(submissions.dictionaryCategoryId, categoryId),
						eq(submissions.createdBy, username),
						eq(submissions.organization, organization),
						or(eq(submissions.status, 'OPEN'), eq(submissions.status, 'VALID'), eq(submissions.status, 'INVALID')),
					),
					columns: getSubmissionColumnsSummary,
					extras: { data: dataSummaryQuery, errors: errorsSummaryQuery },
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
		getSubmissionWithRelationsById: async (submissionId: number): Promise<SubmissionRepositoryRecord | undefined> => {
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
