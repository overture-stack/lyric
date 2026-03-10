import type { ExtractTablesWithRelations, SQL } from 'drizzle-orm';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js';
import { and, count, eq, inArray, sql } from 'drizzle-orm/sql';

import { type NewSubmission, type Submission, submissions } from '@overture-stack/lyric-data-model/models';

import { BaseDependencies } from '../config/config.js';
import { ServiceUnavailable } from '../utils/errors.js';
import { openSubmissionStatus } from '../utils/submissionUtils.js';
import type {
	BooleanTrueObject,
	PaginationOptions,
	SubmissionDataDetailsRepositoryRecord,
	SubmissionDataSummary,
	SubmissionDataSummaryRepositoryRecord,
	SubmissionErrorsSummary,
} from '../utils/types.js';

const activeSubmissionRepository = (dependencies: BaseDependencies) => {
	const LOG_MODULE = 'ACTIVE_SUBMISSION_REPOSITORY';
	const { db, logger } = dependencies;

	// Submission columns for lightweight queries to exclude `data` and `errors` columns to improve performance
	const submissionColumns: BooleanTrueObject = {
		id: true,
		status: true,
		organization: true,
		createdAt: true,
		createdBy: true,
		updatedAt: true,
		updatedBy: true,
	};

	// Submission columns for full detail queries including `data` and `errors` columns
	const submissionColumnsWithData: BooleanTrueObject = {
		...submissionColumns,
		data: true,
		errors: true,
	};

	const submissionDictionaryRelationColumns = {
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
	} as const satisfies Record<string, { columns: BooleanTrueObject }>;

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
		 * @returns The ID of the created Active Submission
		 */
		save: async (data: NewSubmission): Promise<number> => {
			try {
				const [savedActiveSubmission] = await db.insert(submissions).values(data).returning({ id: submissions.id });
				logger.info(LOG_MODULE, `New Active Submission saved successfully`);
				return savedActiveSubmission.id;
			} catch (error) {
				logger.error(LOG_MODULE, `Failed saving Active Submission`, error);
				throw new ServiceUnavailable();
			}
		},

		/**
		 * Returns the entire active submission, including all data.
		 */
		getActiveSubmissionDetails: async ({
			categoryId,
			organization,
			username,
		}: {
			categoryId: number;
			username: string;
			organization: string;
		}): Promise<Pick<Submission, 'data' | 'id'> | undefined> => {
			try {
				const dbResponse = await db.query.submissions.findFirst({
					where: and(
						eq(submissions.dictionaryCategoryId, categoryId),
						eq(submissions.createdBy, username),
						eq(submissions.organization, organization),
						activeStatusesCondition,
					),
					columns: submissionColumnsWithData,
					with: submissionDictionaryRelationColumns,
				});
				return dbResponse;
			} catch (error) {
				logger.error(LOG_MODULE, `Failed getting active submission data`, error);
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
		getActiveSubmissionSummary: async ({
			categoryId,
			username,
			organization,
		}: {
			categoryId: number;
			username: string;
			organization: string;
		}): Promise<SubmissionDataSummaryRepositoryRecord | undefined> => {
			try {
				return await db.query.submissions.findFirst({
					where: and(
						eq(submissions.dictionaryCategoryId, categoryId),
						eq(submissions.createdBy, username),
						eq(submissions.organization, organization),
						activeStatusesCondition,
					),
					columns: submissionColumns,
					with: submissionDictionaryRelationColumns,
					extras: { data: dataSummaryQuery, errors: errorsSummaryQuery },
				});
			} catch (error) {
				logger.error(LOG_MODULE, `Failed getting active submission summary`, error);
				throw new ServiceUnavailable();
			}
		},

		/**
		 * Finds a Submission by ID
		 * @param {number} submissionId Submission ID
		 * @returns The Submission found
		 */
		getSubmissionById: async (submissionId: number): Promise<SubmissionDataSummaryRepositoryRecord | undefined> => {
			try {
				return await db.query.submissions.findFirst({
					where: and(eq(submissions.id, submissionId)),
					columns: submissionColumns,
					with: submissionDictionaryRelationColumns,
					extras: { data: dataSummaryQuery, errors: errorsSummaryQuery },
				});
			} catch (error) {
				logger.error(LOG_MODULE, `Failed getting Submission with id '${submissionId}'`, error);
				throw new ServiceUnavailable();
			}
		},

		/**
		 * Retun the Submission with data details by ID
		 * This includes the `data` and `errors` columns
		 * @param {number} submissionId Submission ID
		 * @returns The Submission found
		 */
		getSubmissionDetailsById: async (
			submissionId: number,
		): Promise<SubmissionDataDetailsRepositoryRecord | undefined> => {
			try {
				return await db.query.submissions.findFirst({
					where: and(eq(submissions.id, submissionId)),
					columns: submissionColumnsWithData,
					with: submissionDictionaryRelationColumns,
				});
			} catch (error) {
				logger.error(LOG_MODULE, `Failed getting Submission details with id '${submissionId}'`, error);
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
		): Promise<number> => {
			try {
				const [resultUpdate] = await (tx || db)
					.update(submissions)
					.set({ ...newData, updatedAt: new Date() })
					.where(eq(submissions.id, submissionId))
					.returning({ id: submissions.id });
				return resultUpdate.id;
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
		getSubmissionsByCategory: async (
			categoryId: number,
			paginationOptions: PaginationOptions,
			filterOptions: {
				onlyActive: boolean;
				username?: string;
				organization?: string;
			},
		): Promise<SubmissionDataSummaryRepositoryRecord[] | undefined> => {
			const { page, pageSize } = paginationOptions;
			try {
				return await db.query.submissions.findMany({
					where: and(
						eq(submissions.dictionaryCategoryId, categoryId),
						filterOptions.username ? eq(submissions.createdBy, filterOptions.username) : undefined,
						filterOptions.onlyActive ? activeStatusesCondition : undefined,
						filterOptions.organization ? eq(submissions.organization, filterOptions.organization) : undefined,
					),
					columns: submissionColumns,
					extras: { data: dataSummaryQuery, errors: errorsSummaryQuery },
					with: submissionDictionaryRelationColumns,
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
	};
};

export default activeSubmissionRepository;
