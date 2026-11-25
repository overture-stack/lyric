import type { SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm/sql';

import { type NewSubmission, type Submission, submissions } from '@overture-stack/lyric-data-model/models';

import { BaseDependencies } from '../config/config.js';
import { ServiceUnavailable } from '../utils/errors.js';
import { inProcessSubmissionStatus, openSubmissionStatus } from '../utils/submissionUtils.js';
import type {
	CategorySummary,
	DictionarySummary,
	PaginationOptions,
	SortKey,
	SubmissionListFilters,
	SubmissionListOptions,
	SubmissionSortField,
	SubmissionStatus,
} from '../utils/types.js';
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

const submissionSortColumns = {
	createdAt: submissions.createdAt,
	createdBy: submissions.createdBy,
	id: submissions.id,
	organization: submissions.organization,
	status: submissions.status,
	updatedAt: submissions.updatedAt,
	updatedBy: submissions.updatedBy,
} as const satisfies Record<SubmissionSortField, PgColumn>;

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

	const buildSubmissionListCondition = (categoryId: number, filters: SubmissionListFilters): SQL | undefined =>
		and(
			eq(submissions.dictionaryCategoryId, categoryId),
			filters.organizations?.length ? inArray(submissions.organization, filters.organizations) : undefined,
			filters.statuses?.length ? inArray(submissions.status, filters.statuses) : undefined,
			filters.username ? eq(submissions.createdBy, filters.username) : undefined,
		);

	const buildSubmissionListOrder = (sort: SortKey<SubmissionSortField>[]): SQL[] => {
		const requestedOrder = sort.map(({ direction, field }) =>
			direction === 'desc' ? desc(submissionSortColumns[field]) : asc(submissionSortColumns[field]),
		);
		const isOrderedById = sort.some(({ field }) => field === 'id');
		return isOrderedById ? requestedOrder : [...requestedOrder, desc(submissions.id)];
	};

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
		 *
		 * - `newData` cannot change the version. Use `incrementVersion` to increment it by one.
		 * - When `expectedVersion` is omitted, the version is not checked.
		 *
		 * Returns the ID and resulting version of the updated Submission, or `undefined` when the Submission does not
		 * exist or does not match the expected status and version. A non-match is not an error.
		 *
		 * @throws {ServiceUnavailable} When the update query fails.
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
		 * Get one page of the Submissions of a category, filtered and sorted.
		 * Submissions that are equal on every requested sort key are ordered by descending ID, so pages never overlap.
		 * @param {number} categoryId - Category ID
		 * @param {Object} paginationOptions - Pagination properties
		 * @param {number} paginationOptions.page - Page number
		 * @param {number} paginationOptions.pageSize - Items per page
		 * @param {SubmissionListOptions} listOptions - Filters and sort order
		 * @returns The Submissions on the requested page
		 */
		getSubmissionsByCategory: async (
			categoryId: number,
			paginationOptions: PaginationOptions,
			listOptions: SubmissionListOptions,
		): Promise<SubmissionWithDictionaryAndCategoryRepositoryRecord[] | undefined> => {
			const { page, pageSize } = paginationOptions;
			try {
				const results = await db.query.submissions.findMany({
					where: buildSubmissionListCondition(categoryId, listOptions.filters),
					columns: submissionColumns,
					with: submissionDictionaryRelationColumns,
					orderBy: buildSubmissionListOrder(listOptions.sort),
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
		 * Count the Submissions of a category that match the filters
		 * @param {number} categoryId - Category ID
		 * @param {SubmissionListFilters} filters - The same filters given to `getSubmissionsByCategory`
		 * @returns The number of matching Submissions across all pages
		 */
		getTotalSubmissionsByCategory: async (categoryId: number, filters: SubmissionListFilters): Promise<number> => {
			try {
				const resultCount = await db
					.select({ total: count() })
					.from(submissions)
					.where(buildSubmissionListCondition(categoryId, filters));
				return resultCount[0]?.total ?? 0;
			} catch (error) {
				logger.error(LOG_MODULE, `Failed counting Submission with categoryId '${categoryId}'`, error);
				throw new ServiceUnavailable();
			}
		},
	};
};

export default activeSubmissionRepository;
