import { type ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js';
import { and, count, eq, inArray } from 'drizzle-orm/sql';

import {
	type NewSubmissionRecord,
	submissionFiles,
	type SubmissionRecord,
	type SubmissionRecordError,
	submissionRecords,
} from '@overture-stack/lyric-data-model/models';

import { BaseDependencies } from '../config/config.js';
import { ServiceUnavailable } from '../utils/errors.js';
import type { PaginationOptions, SubmissionRecordActionType, SubmissionRecordState } from '../utils/types.js';

// This is the information stored about each individual submission record in the database, including it's entity name.
export type SubmissionRecordWithEntityName = SubmissionRecord & { entityName: string };

// Raw data returned from the database
export type RecordsSummaryRepository = {
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

	const getByFileIds = async (
		fileIds: number[],
		paginationOptions?: PaginationOptions,
		filterOptions?: { actionTypes?: SubmissionRecordActionType[]; states?: SubmissionRecordState[] },
	): Promise<SubmissionRecordWithEntityName[]> => {
		const query = db
			.select({
				actionType: submissionRecords.actionType,
				data: submissionRecords.data,
				entityName: submissionFiles.entityName,
				errors: submissionRecords.errors,
				fileId: submissionRecords.fileId,
				id: submissionRecords.id,
				state: submissionRecords.state,
			})
			.from(submissionRecords)
			.innerJoin(submissionFiles, eq(submissionRecords.fileId, submissionFiles.id))
			.where(
				and(
					inArray(submissionRecords.fileId, fileIds),
					filterOptions?.actionTypes ? inArray(submissionRecords.actionType, filterOptions.actionTypes) : undefined,
					filterOptions?.states?.length ? inArray(submissionRecords.state, filterOptions.states) : undefined,
				),
			)
			.orderBy(submissionRecords.id);

		if (paginationOptions) {
			query.limit(paginationOptions.pageSize).offset((paginationOptions.page - 1) * paginationOptions.pageSize);
		}

		return await query;
	};

	const saveMany = async (
		inputs: NewSubmissionRecord[],
		tx?: PgTransaction<PostgresJsQueryResultHKT, SubmissionRecord, ExtractTablesWithRelations<SubmissionRecord>>,
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

	const deleteByFileIds = async (
		fileIds: number[],
		tx?: PgTransaction<PostgresJsQueryResultHKT, SubmissionRecord, ExtractTablesWithRelations<SubmissionRecord>>,
	): Promise<number> => {
		if (!fileIds.length) {
			return 0;
		}
		try {
			const deletedRecords = await (tx || db)
				.delete(submissionRecords)
				.where(inArray(submissionRecords.fileId, fileIds))
				.returning({ id: submissionRecords.id });
			logger.info(LOG_MODULE, `Deleted '${deletedRecords.length}' Submission Record records by fileIds`);
			return deletedRecords.length;
		} catch (error) {
			logger.error(LOG_MODULE, `Failed deleting Submission Records by fileIds`, error);
			throw new ServiceUnavailable();
		}
	};

	return {
		saveMany,

		saveManyForFile: async (
			fileId: number,
			records: Omit<NewSubmissionRecord, 'fileId'>[],
			tx?: PgTransaction<PostgresJsQueryResultHKT, SubmissionRecord, ExtractTablesWithRelations<SubmissionRecord>>,
		): Promise<number[]> => {
			// TODO: Batch insert records
			const inputs: NewSubmissionRecord[] = records.map((record) => ({ ...record, fileId }));
			return await saveMany(inputs, tx);
		},

		getById: async (id: number): Promise<SubmissionRecordWithEntityName | undefined> => {
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
		},

		getByFileIds,

		getBySubmissionId: async (
			submissionId: number,
			paginationOptions?: PaginationOptions,
			filterOptions?: {
				actionTypes?: SubmissionRecordActionType[];
				states?: SubmissionRecordState[];
				entityNames?: string[];
				fileId?: number;
			},
		): Promise<SubmissionRecordWithEntityName[]> => {
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
					return [];
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
		},

		getRecordsSummaryBySubmissionId: async (submissionId: number): Promise<RecordsSummaryRepository[]> => {
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
		},

		/**
		 * This function updates the validation state of submission records based on the provided parameters.
		 * It can update records to 'VALID', 'RECEIVED', or 'INVALID' states, and also set errors for invalid records.
		 * @param params
		 * @param tx
		 * @returns
		 */
		updateValidationState: async (
			params: {
				validRecordIds?: number[];
				receivedRecordIds?: number[];
				invalidRecords?: Array<{ id: number; errors?: SubmissionRecordError[] }>;
			},
			tx?: PgTransaction<PostgresJsQueryResultHKT, SubmissionRecord, ExtractTablesWithRelations<SubmissionRecord>>,
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
		},

		countBySubmissionId: async (
			submissionId: number,
		): Promise<Array<{ actionType: SubmissionRecordActionType; total: number }>> => {
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
		},

		countInvalidBySubmissionId: async (
			submissionId: number,
		): Promise<Array<{ actionType: SubmissionRecordActionType; total: number }>> => {
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
		},

		deleteByIds: async (
			ids: number[],
			tx?: PgTransaction<PostgresJsQueryResultHKT, SubmissionRecord, ExtractTablesWithRelations<SubmissionRecord>>,
		): Promise<number> => {
			try {
				return await (tx || db).delete(submissionRecords).where(inArray(submissionRecords.id, ids));
			} catch (error) {
				logger.error(LOG_MODULE, `Failed deleting Submission Record by ids '${ids}'`, error);
				throw new ServiceUnavailable();
			}
		},

		deleteByFileIds,

		deleteBySubmissionId: async (
			submissionId: number,
			tx?: PgTransaction<PostgresJsQueryResultHKT, SubmissionRecord, ExtractTablesWithRelations<SubmissionRecord>>,
		): Promise<number> => {
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
		},
	};
};

export default submissionRecordsRepository;
