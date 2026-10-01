import type { SQL } from 'drizzle-orm';
import { and, count, eq, inArray, sql } from 'drizzle-orm/sql';

import { type NewSubmission, type Submission, submissions } from '@overture-stack/lyric-data-model/models';

import { BaseDependencies } from '../config/config.js';
import { ServiceUnavailable } from '../utils/errors.js';
import { inProcessSubmissionStatus, openSubmissionStatus } from '../utils/submissionUtils.js';
import type { CategorySummary, DictionarySummary, PaginationOptions, SubmissionStatus } from '../utils/types.js';
import type { BooleanTrueObject, PartialColumns, RepositoryTransaction } from './types.js';

export type SubmissionWithDictionaryAndCategoryRepositoryRecord = {
	id: number;
	dictionary: DictionarySummary;
	dictionaryCategory: CategorySummary;
	organization: string;
	status: SubmissionStatus;
	version: number;
	createdAt: Date | null;
	createdBy: string | null;
	updatedAt: Date | null;
	updatedBy: string | null;
};

const activeSubmissionRepository = (dependencies: BaseDependencies) => {
	const LOG_MODULE = 'ACTIVE_SUBMISSION_REPOSITORY';
	const { db, logger } = dependencies;

	// Submission columns for lightweight queries to exclude foreign ID fields
	const submissionColumns = {
		id: true,
		status: true,
		version: true,
		organization: true,
		createdAt: true,
		createdBy: true,
		updatedAt: true,
		updatedBy: true,
	} as const satisfies PartialColumns<Omit<Submission, 'dictionaryCategoryId' | 'dictionaryId'>>;

	const submissionDictionaryRelationColumns = {
		dictionary: {
			columns: {
				name: true,
				version: true,
			},
		},
		dictionaryCategory: {
			columns: {
				alias: true,
				id: true,
				name: true,
			},
		},
	} as const satisfies Record<string, { columns: BooleanTrueObject }>;

	/**
	 * Normalizes a queried record's `dictionaryCategory.alias` from the DB's `string | null`
	 * to the public `CategorySummary` contract's `string | undefined` (omitted, not null, when unset).
	 */
	const withAliasNormalized = (
		record: Omit<SubmissionWithDictionaryAndCategoryRepositoryRecord, 'dictionaryCategory'> & {
			dictionaryCategory: Omit<CategorySummary, 'alias'> & { alias: string | null };
		},
	): SubmissionWithDictionaryAndCategoryRepositoryRecord => ({
		...record,
		dictionaryCategory: { ...record.dictionaryCategory, alias: record.dictionaryCategory.alias ?? undefined },
	});

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
	const activeStatusesCondition: SQL = inArray(submissions.status, [
		...openSubmissionStatus,
		...inProcessSubmissionStatus,
	]);

	return {
		/**
		 * Save a new Active Submission in Database
		 * @param data An Active Submission object to be saved
		 * @returns The ID of the created Active Submission
		 */
		save: async (data: NewSubmission): Promise<number> => {
			try {
				const [savedActiveSubmission] = await db.insert(submissions).values(data).returning({ id: submissions.id });
				if (!savedActiveSubmission) {
					throw new Error('Failed to insert Active Submission, no row returned');
				}
				logger.info(LOG_MODULE, `New Active Submission saved successfully`);
				return savedActiveSubmission.id;
			} catch (error) {
				logger.error(LOG_MODULE, `Failed saving Active Submission`, error);
				throw new ServiceUnavailable();
			}
		},

		/**
		 * Finds the current Active Submission by parameters
		 * Returns general information about the Submission, including its dictionary and category relations,
		 * omitting its submissionFiles or submissionRecords relations.
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
		}): Promise<SubmissionWithDictionaryAndCategoryRepositoryRecord | undefined> => {
			try {
				const result = await db.query.submissions.findFirst({
					where: and(
						eq(submissions.dictionaryCategoryId, categoryId),
						eq(submissions.createdBy, username),
						eq(submissions.organization, organization),
						activeStatusesCondition,
					),
					columns: submissionColumns,
					with: submissionDictionaryRelationColumns,
				});
				return result ? withAliasNormalized(result) : undefined;
			} catch (error) {
				logger.error(LOG_MODULE, `Failed getting active submission summary`, error);
				throw new ServiceUnavailable();
			}
		},

		/**
		 * Finds a Submission by ID
		 * Returns general information about the Submission, including its dictionary and category relations,
		 * omitting its submissionFiles or submissionRecords relations.
		 * @param {number} submissionId Submission ID
		 * @returns The Submission found
		 */
		getSubmissionById: async (
			submissionId: number,
		): Promise<SubmissionWithDictionaryAndCategoryRepositoryRecord | undefined> => {
			try {
				const result = await db.query.submissions.findFirst({
					where: and(eq(submissions.id, submissionId)),
					columns: submissionColumns,
					with: submissionDictionaryRelationColumns,
				});
				return result ? withAliasNormalized(result) : undefined;
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
			newData: Omit<Partial<Submission>, 'id' | 'version'>,
			tx?: RepositoryTransaction<Submission>,
		): Promise<number> => {
			try {
				const [resultUpdate] = await (tx || db)
					.update(submissions)
					.set({ ...newData, updatedAt: new Date() })
					.where(eq(submissions.id, submissionId))
					.returning({ id: submissions.id });
				if (!resultUpdate) {
					throw new Error(`Failed to update Active Submission with id '${submissionId}', no row returned`);
				}
				return resultUpdate.id;
			} catch (error) {
				logger.error(LOG_MODULE, `Failed updating Active Submission with id '${submissionId}'`, error);
				throw new ServiceUnavailable();
			}
		},

		/**
		 * Updates a Submission only if its current status is one of `expectedStatuses` and, when provided, its
		 * current version equals `expectedVersion`. The check and the update are a single
		 * `UPDATE ... WHERE ... RETURNING` statement, so there is no gap between them.
		 *
		 * The updated row stays locked until the surrounding transaction ends. Any other conditional update on the
		 * same Submission waits for that transaction, then re-checks its conditions against the committed row.
		 * Run this as the first statement of a transaction to serialize concurrent changes to the same Submission.
		 * @param params
		 * @param params.submissionId Submission ID to update
		 * @param params.newData Fields to update. The version can only be changed through `incrementVersion`
		 * @param params.expectedStatuses Statuses the Submission must currently have
		 * @param params.expectedVersion Version the Submission must currently have, optional
		 * @param params.incrementVersion When true, the version is incremented by one
		 * @param tx The transaction to use for the operation, optional
		 * @returns The ID and resulting version of the updated Submission, or `undefined` if the Submission does not
		 * exist or does not match the expected status and version
		 */
		updateWithConditions: async (
			{
				submissionId,
				newData,
				expectedStatuses,
				expectedVersion,
				incrementVersion = false,
			}: {
				submissionId: number;
				newData: Omit<Partial<Submission>, 'id' | 'version'>;
				expectedStatuses: readonly SubmissionStatus[];
				expectedVersion?: number;
				incrementVersion?: boolean;
			},
			tx?: RepositoryTransaction<Submission>,
		): Promise<{ id: number; version: number } | undefined> => {
			try {
				const [resultUpdate] = await (tx || db)
					.update(submissions)
					.set({
						...newData,
						updatedAt: new Date(),
						...(incrementVersion ? { version: sql`${submissions.version} + 1` } : {}),
					})
					.where(
						and(
							eq(submissions.id, submissionId),
							inArray(submissions.status, [...expectedStatuses]),
							expectedVersion !== undefined ? eq(submissions.version, expectedVersion) : undefined,
						),
					)
					.returning({ id: submissions.id, version: submissions.version });
				return resultUpdate;
			} catch (error) {
				logger.error(LOG_MODULE, `Failed conditionally updating Active Submission with id '${submissionId}'`, error);
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
		): Promise<SubmissionWithDictionaryAndCategoryRepositoryRecord[] | undefined> => {
			const { page, pageSize } = paginationOptions;
			try {
				const results = await db.query.submissions.findMany({
					where: and(
						eq(submissions.dictionaryCategoryId, categoryId),
						filterOptions.username ? eq(submissions.createdBy, filterOptions.username) : undefined,
						filterOptions.onlyActive ? activeStatusesCondition : undefined,
						filterOptions.organization ? eq(submissions.organization, filterOptions.organization) : undefined,
					),
					columns: submissionColumns,
					with: submissionDictionaryRelationColumns,
					orderBy: (submissions, { desc }) => desc(submissions.createdAt),
					limit: pageSize,
					offset: (page - 1) * pageSize,
				});
				return results.map(withAliasNormalized);
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
				return resultCount[0]?.total ?? 0;
			} catch (error) {
				logger.error(LOG_MODULE, `Failed counting Submission with categoryId '${categoryId}'`, error);
				throw new ServiceUnavailable();
			}
		},
	};
};

export default activeSubmissionRepository;
