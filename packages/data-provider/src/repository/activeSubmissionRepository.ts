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

const repository = (dependencies: BaseDependencies) => {
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

	const submissionDictionaryRelationColumns: { [key: string]: { columns: BooleanTrueObject } } = {
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
	const dataSummaryQuery = sql<SubmissionDataSummary>`(
	WITH sections AS (
		SELECT 'inserts' AS section, jsonb_each(${submissions.data}->'inserts') AS kv
		UNION ALL
		SELECT 'updates' AS section, jsonb_each(${submissions.data}->'updates')
		UNION ALL
		SELECT 'deletes' AS section, jsonb_each(${submissions.data}->'deletes')
	),
	expanded AS (
		SELECT
		section,
		(kv).key AS entity,
		CASE
			WHEN jsonb_typeof((kv).value->'records') = 'array'
			THEN jsonb_array_length((kv).value->'records')
			ELSE 0
		END AS cnt
		FROM sections
	),
	per_entity AS (
		SELECT
		entity,
		COALESCE(MAX(CASE WHEN section='inserts' THEN cnt END), 0) AS inserts_count,
		COALESCE(MAX(CASE WHEN section='updates' THEN cnt END), 0) AS updates_count,
		COALESCE(MAX(CASE WHEN section='deletes' THEN cnt END), 0) AS deletes_count
		FROM expanded
		GROUP BY entity
	)
	SELECT jsonb_object_agg(
			entity,
			jsonb_build_object(
				'inserts', inserts_count,
				'updates', updates_count,
				'deletes', deletes_count
			)
	)
	FROM per_entity
)`.as('data');

	/**
	 * A query to generate a summarized JSON object of the 'errors' column
	 * Returns a json object of type SubmissionErrorsSummary
	 */
	const errorsSummaryQuery = sql<SubmissionErrorsSummary>`(
	SELECT jsonb_object_agg(
        entity,
        jsonb_build_object(
            'inserts', COALESCE(inserts_count, 0),
            'updates', COALESCE(updates_count, 0),
            'deletes', COALESCE(deletes_count, 0)
        )
    )
	FROM (
    	SELECT entity,
        SUM(CASE WHEN section = 'inserts' THEN cnt END) AS inserts_count,
        SUM(CASE WHEN section = 'updates' THEN cnt END) AS updates_count,
        SUM(CASE WHEN section = 'deletes' THEN cnt END) AS deletes_count
    	FROM (
			SELECT section,
					key AS entity,
					CASE
					WHEN jsonb_typeof(value) = 'array'
					THEN jsonb_array_length(value)
					ELSE 0
					END AS cnt
			FROM (
				SELECT section, key, value
				FROM (VALUES ('inserts'), ('updates'), ('deletes')) AS s(section)
				CROSS JOIN LATERAL jsonb_each(errors->section)
			) x
		) grouped
    	GROUP BY entity
  	) final
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
		save: async (data: NewSubmission): Promise<{ id: number }> => {
			try {
				const [savedActiveSubmission] = await db.insert(submissions).values(data).returning({ id: submissions.id });
				logger.info(LOG_MODULE, `New Active Submission saved successfully`);
				return savedActiveSubmission;
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
				logger.error(LOG_MODULE, `Failed getting active Submission`, error);
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
		): Promise<{ id: number }> => {
			try {
				const resultUpdate = await (tx || db)
					.update(submissions)
					.set({ ...newData, updatedAt: new Date() })
					.where(eq(submissions.id, submissionId))
					.returning({ id: submissions.id });
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

export default repository;
