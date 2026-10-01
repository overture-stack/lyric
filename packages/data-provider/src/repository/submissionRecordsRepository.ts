import { and, count, eq, inArray, ne } from 'drizzle-orm/sql';

import {
	type NewSubmissionRecord,
	submissionFiles,
	type SubmissionRecord,
	type SubmissionRecordError,
	submissionRecords,
} from '@overture-stack/lyric-data-model/models';

import { BaseDependencies } from '../config/config.js';
import { ServiceUnavailable } from '../utils/errors.js';
import type { SubmissionRecordActionType, SubmissionRecordState } from '../utils/submissionTypes.js';
import type { PaginatedResponse, PaginationOptions } from '../utils/types.js';
import type { RepositoryTransaction } from './types.js';

// This is the information stored about each individual submission record in the database, including it's entity name.
export type SubmissionRecordWithEntityName = SubmissionRecord & { entityName: string };

/**
 * Represents submission records aggregated by file and action type, including the total record and error counts for each group.
 */
export type SubmissionRecordAggregate = {
	actionType: SubmissionRecordActionType;
	batchName?: string;
	entityName: string;
	errors: number;
	fileId: number;
	totalRecords: number;
};

const submissionRecordsRepository = (dependencies: BaseDependencies) => {
	const LOG_MODULE = 'SUBMISSION_RECORDS_REPOSITORY';
	const { db, logger } = dependencies;

	const countBySubmissionId = async (
		submissionId: number,
	): Promise<{ actionType: SubmissionRecordActionType; total: number }[]> => {
		try {
			return await db
				.select({ actionType: submissionRecords.actionType, total: count() })
				.from(submissionRecords)
				.innerJoin(submissionFiles, eq(submissionRecords.fileId, submissionFiles.id))
				.where(eq(submissionFiles.submissionId, submissionId))
				.groupBy(submissionRecords.actionType);
		} catch (error) {
			logger.error(
				LOG_MODULE,
				`Failed counting Submission Records by action for submissionId '${submissionId}'`,
				error,
			);
			throw new ServiceUnavailable();
		}
	};

	const countInvalidBySubmissionId = async (
		submissionId: number,
	): Promise<{ actionType: SubmissionRecordActionType; total: number }[]> => {
		try {
			return await db
				.select({ actionType: submissionRecords.actionType, total: count() })
				.from(submissionRecords)
				.innerJoin(submissionFiles, eq(submissionRecords.fileId, submissionFiles.id))
				.where(and(eq(submissionFiles.submissionId, submissionId), eq(submissionRecords.state, 'INVALID')))
				.groupBy(submissionRecords.actionType);
		} catch (error) {
			logger.error(
				LOG_MODULE,
				`Failed counting invalid Submission Records by action for submissionId '${submissionId}'`,
				error,
			);
			throw new ServiceUnavailable();
		}
	};

	/**
	 * Counts the records of a Submission whose state is not `VALID`, either because they have not been validated
	 * yet (`RECEIVED`) or because they failed validation (`INVALID`).
	 * @param submissionId Submission ID
	 * @param tx The transaction to use for the operation, optional
	 * @returns The number of records not in the `VALID` state
	 */
	const countNotValidBySubmissionId = async (
		submissionId: number,
		tx?: RepositoryTransaction<SubmissionRecord>,
	): Promise<number> => {
		try {
			const [result] = await (tx || db)
				.select({ total: count() })
				.from(submissionRecords)
				.innerJoin(submissionFiles, eq(submissionRecords.fileId, submissionFiles.id))
				.where(and(eq(submissionFiles.submissionId, submissionId), ne(submissionRecords.state, 'VALID')));
			return result?.total ?? 0;
		} catch (error) {
			logger.error(
				LOG_MODULE,
				`Failed counting not valid Submission Records for submissionId '${submissionId}'`,
				error,
			);
			throw new ServiceUnavailable();
		}
	};

	const deleteByFileIds = async (
		fileIds: number[],
		tx?: RepositoryTransaction<SubmissionRecord>,
	): Promise<{ id: number }[]> => {
		if (!fileIds.length) {
			return [];
		}
		try {
			const deletedRecords = await (tx || db)
				.delete(submissionRecords)
				.where(inArray(submissionRecords.fileId, fileIds))
				.returning({ id: submissionRecords.id });
			logger.info(LOG_MODULE, `Deleted '${deletedRecords.length}' Submission Record records by fileIds`);
			return deletedRecords;
		} catch (error) {
			logger.error(LOG_MODULE, `Failed deleting Submission Records by fileIds`, error);
			throw new ServiceUnavailable();
		}
	};

	const deleteByIds = async (ids: number[], tx?: RepositoryTransaction<SubmissionRecord>): Promise<number> => {
		if (ids.length === 0) {
			return 0;
		}

		try {
			return await (tx || db).delete(submissionRecords).where(inArray(submissionRecords.id, ids));
		} catch (error) {
			logger.error(LOG_MODULE, `Failed deleting Submission Record by ids '${ids}'`, error);
			throw new ServiceUnavailable();
		}
	};

	const deleteBySubmissionId = async (
		submissionId: number,
		tx?: RepositoryTransaction<SubmissionRecord>,
	): Promise<{ id: number }[]> => {
		try {
			const submissionFileIds = await (tx || db)
				.select({ id: submissionFiles.id })
				.from(submissionFiles)
				.where(eq(submissionFiles.submissionId, submissionId));
			const fileIds = submissionFileIds.map((file) => file.id);
			return await deleteByFileIds(fileIds, tx);
		} catch (error) {
			logger.error(LOG_MODULE, `Failed deleting Submission Records by submissionId '${submissionId}'`, error);
			throw new ServiceUnavailable();
		}
	};

	const getById = async (id: number): Promise<SubmissionRecordWithEntityName | undefined> => {
		try {
			const query = await db
				.select({
					id: submissionRecords.id,
					actionType: submissionRecords.actionType,
					state: submissionRecords.state,
					fileId: submissionRecords.fileId,
					data: submissionRecords.data,
					errors: submissionRecords.errors,
					entityName: submissionFiles.entityName,
					lineNumber: submissionRecords.lineNumber,
				})
				.from(submissionRecords)
				.innerJoin(submissionFiles, eq(submissionRecords.fileId, submissionFiles.id))
				.where(eq(submissionRecords.id, id))
				.limit(1);

			if (query.length === 0) {
				return undefined;
			}
			return query[0];
		} catch (error) {
			logger.error(LOG_MODULE, `Failed getting Submission Record by id '${id}'`, error);
			throw new ServiceUnavailable();
		}
	};

	const getByFileIds = async (
		fileIds: number[],
		paginationOptions?: PaginationOptions,
		filterOptions?: { actionTypes?: SubmissionRecordActionType[]; states?: SubmissionRecordState[] },
	): Promise<PaginatedResponse<SubmissionRecordWithEntityName>> => {
		const whereClause = and(
			inArray(submissionRecords.fileId, fileIds),
			filterOptions?.actionTypes ? inArray(submissionRecords.actionType, filterOptions.actionTypes) : undefined,
			filterOptions?.states?.length ? inArray(submissionRecords.state, filterOptions.states) : undefined,
		);

		const [totalRecords, records] = await db.transaction(async (tx) => {
			const query = tx
				.select({
					actionType: submissionRecords.actionType,
					data: submissionRecords.data,
					entityName: submissionFiles.entityName,
					errors: submissionRecords.errors,
					fileId: submissionRecords.fileId,
					id: submissionRecords.id,
					state: submissionRecords.state,
					lineNumber: submissionRecords.lineNumber,
				})
				.from(submissionRecords)
				.innerJoin(submissionFiles, eq(submissionRecords.fileId, submissionFiles.id))
				.where(whereClause)
				.orderBy(submissionRecords.id);

			if (paginationOptions) {
				query.limit(paginationOptions.pageSize).offset((paginationOptions.page - 1) * paginationOptions.pageSize);
			}

			return Promise.all([tx.select({ count: count() }).from(submissionRecords).where(whereClause), query]);
		});

		const recordCount = totalRecords[0]?.count || 0;

		return {
			records,
			pagination: {
				currentPage: paginationOptions?.page ?? 1,
				pageSize: paginationOptions?.pageSize ?? records.length,
				totalPages: paginationOptions?.pageSize ? Math.ceil(recordCount / paginationOptions.pageSize) : 1,
				totalRecords: recordCount,
			},
		};
	};

	const getBySubmissionId = async (
		submissionId: number,
		paginationOptions?: PaginationOptions,
		filterOptions?: {
			actionTypes?: SubmissionRecordActionType[];
			states?: SubmissionRecordState[];
			entityNames?: string[];
			fileId?: number;
		},
	): Promise<PaginatedResponse<SubmissionRecordWithEntityName>> => {
		try {
			const submissionFileIds = await db
				.select({ id: submissionFiles.id, entityName: submissionFiles.entityName })
				.from(submissionFiles)
				.where(
					and(
						eq(submissionFiles.submissionId, submissionId),
						filterOptions?.entityNames?.length
							? inArray(submissionFiles.entityName, filterOptions.entityNames)
							: undefined,
						filterOptions?.fileId ? eq(submissionFiles.id, filterOptions.fileId) : undefined,
					),
				);

			if (submissionFileIds.length === 0) {
				logger.info(
					LOG_MODULE,
					`No submission files found for submissionId '${submissionId}' with the provided filter options.`,
				);
				return { records: [], pagination: { currentPage: 1, pageSize: 0, totalPages: 0, totalRecords: 0 } };
			}

			return await getByFileIds(
				submissionFileIds.map((file) => file.id),
				paginationOptions,
				{
					actionTypes: filterOptions?.actionTypes,
					states: filterOptions?.states,
				},
			);
		} catch (error) {
			logger.error(LOG_MODULE, `Failed getting Submission Records by submissionId '${submissionId}'`, error);
			throw new ServiceUnavailable();
		}
	};

	const getRecordsSummaryBySubmissionId = async (submissionId: number): Promise<SubmissionRecordAggregate[]> => {
		try {
			const submissionFileRecords = await db
				.select({
					actionType: submissionRecords.actionType,
					batchName: submissionFiles.fileName,
					entityName: submissionFiles.entityName,
					errors: count(submissionRecords.errors),
					fileId: submissionFiles.id,
					totalRecords: count(),
				})
				.from(submissionRecords)
				.innerJoin(submissionFiles, eq(submissionRecords.fileId, submissionFiles.id))
				.where(eq(submissionFiles.submissionId, submissionId))
				.groupBy(
					submissionFiles.id,
					submissionRecords.actionType,
					submissionFiles.entityName,
					submissionFiles.fileName,
				);

			return submissionFileRecords;
		} catch (error) {
			logger.error(LOG_MODULE, `Failed getting Submission Records summary by submissionId '${submissionId}'`, error);
			throw new ServiceUnavailable();
		}
	};

	const getRecordsSummaryBySubmissionIds = async (
		submissionIds: number[],
	): Promise<Record<number, SubmissionRecordAggregate[]>> => {
		if (submissionIds.length === 0) {
			return {};
		}

		try {
			const submissionFileRecords = await db
				.select({
					actionType: submissionRecords.actionType,
					batchName: submissionFiles.fileName,
					entityName: submissionFiles.entityName,
					errors: count(submissionRecords.errors),
					fileId: submissionFiles.id,
					submissionId: submissionFiles.submissionId,
					totalRecords: count(),
				})
				.from(submissionRecords)
				.innerJoin(submissionFiles, eq(submissionRecords.fileId, submissionFiles.id))
				.where(inArray(submissionFiles.submissionId, submissionIds))
				.groupBy(
					submissionFiles.submissionId,
					submissionFiles.id,
					submissionRecords.actionType,
					submissionFiles.entityName,
					submissionFiles.fileName,
				);

			return submissionFileRecords.reduce<Record<number, SubmissionRecordAggregate[]>>((summaries, record) => {
				const records = summaries[record.submissionId] ?? [];
				records.push({
					actionType: record.actionType,
					batchName: record.batchName,
					entityName: record.entityName,
					errors: record.errors,
					fileId: record.fileId,
					totalRecords: record.totalRecords,
				});
				summaries[record.submissionId] = records;
				return summaries;
			}, {});
		} catch (error) {
			logger.error(LOG_MODULE, `Failed getting Submission Records summaries by submission IDs`, error);
			throw new ServiceUnavailable();
		}
	};

	const saveMany = async (
		inputs: NewSubmissionRecord[],
		tx?: RepositoryTransaction<SubmissionRecord>,
	): Promise<number[]> => {
		if (!inputs.length) {
			return [];
		}
		try {
			// TODO: Insert in batches if inputs.length > 1000 to avoid exceeding the maximum number of parameters in a single query
			const savedSubmissionRecords = await (tx || db)
				.insert(submissionRecords)
				.values(inputs)
				.returning({ id: submissionRecords.id });
			logger.info(LOG_MODULE, `Saved '${savedSubmissionRecords.length}' Submission Record records successfully`);
			return savedSubmissionRecords.map((record) => record.id);
		} catch (error) {
			logger.error(LOG_MODULE, `Failed saving '${inputs.length}' Submission Record records`, error);
			throw new ServiceUnavailable();
		}
	};

	const saveManyForFile = async (
		fileId: number,
		records: Omit<NewSubmissionRecord, 'fileId'>[],
		tx?: RepositoryTransaction<SubmissionRecord>,
	): Promise<number[]> => {
		// TODO: Batch insert records
		const inputs: NewSubmissionRecord[] = records.map((record) => ({ ...record, fileId }));
		return await saveMany(inputs, tx);
	};

	/**
	 * Sets the validation state for multiple submission records. IDs are grouped by their target `VALID`,
	 * `RECEIVED`, or `INVALID` states; invalid records can also include validation errors. Omitted or empty
	 * groups are ignored. When an ID appears in multiple groups, the groups are applied in this order:
	 * `VALID`, then `RECEIVED`, and finally `INVALID`, so `INVALID` takes precedence.
	 *
	 * @throws {ServiceUnavailable} when the records cannot be updated.
	 */
	const updateValidationState = async (
		params: {
			validRecordIds?: number[];
			receivedRecordIds?: number[];
			invalidRecords?: { id: number; errors?: SubmissionRecordError[] }[];
		},
		tx?: RepositoryTransaction<SubmissionRecord>,
	): Promise<number[]> => {
		const executor = tx || db;

		const validRecordIds = params.validRecordIds ?? [];
		const receivedRecordIds = params.receivedRecordIds ?? [];
		const invalidRecords = params.invalidRecords ?? [];
		if (!validRecordIds.length && !receivedRecordIds.length && !invalidRecords.length) {
			return [];
		}

		try {
			const updatedIds: number[] = [];

			if (validRecordIds.length) {
				const validUpdates = await executor
					.update(submissionRecords)
					.set({ state: 'VALID', errors: null })
					.where(inArray(submissionRecords.id, validRecordIds))
					.returning({ id: submissionRecords.id });
				updatedIds.push(...validUpdates.map((record) => record.id));
			}

			if (receivedRecordIds.length) {
				const receivedUpdates = await executor
					.update(submissionRecords)
					.set({ state: 'RECEIVED', errors: null })
					.where(inArray(submissionRecords.id, receivedRecordIds))
					.returning({ id: submissionRecords.id });
				updatedIds.push(...receivedUpdates.map((record) => record.id));
			}

			// TODO: Batch or chunk invalid record updates to avoid one concurrent query per record.
			if (invalidRecords.length) {
				const invalidUpdates = await Promise.all(
					invalidRecords.map(async ({ id, errors }) => {
						const [updatedRecord] = await executor
							.update(submissionRecords)
							.set({ state: 'INVALID', errors: errors ?? null })
							.where(eq(submissionRecords.id, id))
							.returning({ id: submissionRecords.id });
						return updatedRecord?.id;
					}),
				);
				updatedIds.push(...invalidUpdates.filter((id): id is number => id !== undefined));
			}

			logger.info(
				LOG_MODULE,
				`Updated Submission Record states: VALID='${validRecordIds.length}', RECEIVED='${receivedRecordIds.length}', INVALID='${invalidRecords.length}'`,
			);
			return [...new Set(updatedIds)];
		} catch (error) {
			logger.error(LOG_MODULE, `Failed updating Submission Record validation state`, error);
			throw new ServiceUnavailable();
		}
	};

	return {
		countBySubmissionId,
		countInvalidBySubmissionId,
		countNotValidBySubmissionId,

		deleteByIds,
		deleteByFileIds,
		deleteBySubmissionId,

		getById,
		getByFileIds,
		getBySubmissionId,
		getRecordsSummaryBySubmissionId,
		getRecordsSummaryBySubmissionIds,

		saveMany,
		saveManyForFile,

		updateValidationState,
	};
};

export default submissionRecordsRepository;
