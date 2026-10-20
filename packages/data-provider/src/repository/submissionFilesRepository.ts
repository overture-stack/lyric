import { and, eq, notExists } from 'drizzle-orm/sql';

import {
	type NewSubmissionFile,
	type SubmissionFile,
	submissionFiles,
	submissionRecords,
} from '@overture-stack/lyric-data-model/models';

import { BaseDependencies } from '../config/config.js';
import { ServiceUnavailable } from '../utils/errors.js';
import type { RepositoryTransaction } from './types.js';

const submissionFilesRepository = (dependencies: BaseDependencies) => {
	const LOG_MODULE = 'SUBMISSION_FILES_REPOSITORY';
	const { db, logger } = dependencies;

	return {
		save: async (input: NewSubmissionFile, tx?: RepositoryTransaction<SubmissionFile>): Promise<number> => {
			try {
				const [savedSubmissionFile] = await (tx || db)
					.insert(submissionFiles)
					.values(input)
					.returning({ id: submissionFiles.id });
				if (!savedSubmissionFile) {
					throw new Error('Failed to insert Submission File, no row returned');
				}
				logger.info(LOG_MODULE, `New Submission File saved successfully`);
				return savedSubmissionFile.id;
			} catch (error) {
				logger.error(LOG_MODULE, `Failed saving Submission File`, error);
				throw new ServiceUnavailable();
			}
		},

		getById: async (fileId: number): Promise<SubmissionFile | undefined> => {
			try {
				return await db.query.submissionFiles.findFirst({
					where: eq(submissionFiles.id, fileId),
				});
			} catch (error) {
				logger.error(LOG_MODULE, `Failed getting Submission File by id '${fileId}'`, error);
				throw new ServiceUnavailable();
			}
		},

		getBySubmissionId: async (submissionId: number): Promise<SubmissionFile[]> => {
			try {
				return await db.query.submissionFiles.findMany({
					where: eq(submissionFiles.submissionId, submissionId),
				});
			} catch (error) {
				logger.error(LOG_MODULE, `Failed getting Submission Files by submissionId '${submissionId}'`, error);
				throw new ServiceUnavailable();
			}
		},

		deleteById: async (fileId: number, tx?: RepositoryTransaction<SubmissionFile>): Promise<number | undefined> => {
			try {
				const deletedFiles = await (tx || db)
					.delete(submissionFiles)
					.where(eq(submissionFiles.id, fileId))
					.returning({ id: submissionFiles.id });
				logger.info(LOG_MODULE, `Deleted Submission Files with id '${fileId}'`);
				return deletedFiles[0]?.id;
			} catch (error) {
				logger.error(LOG_MODULE, `Failed deleting Submission File by fileId '${fileId}'`, error);
				throw new ServiceUnavailable();
			}
		},

		/**
		 * Deletes a submission's system-generated files that no longer have any records, such as after removing a user's
		 * file also removed the child records the system staged for it. Files the user submitted are never deleted here.
		 * @returns The IDs of the deleted files
		 */
		deleteEmptySystemGeneratedBySubmissionId: async (
			submissionId: number,
			tx?: RepositoryTransaction<SubmissionFile>,
		): Promise<number[]> => {
			try {
				const deletedFiles = await (tx || db)
					.delete(submissionFiles)
					.where(
						and(
							eq(submissionFiles.submissionId, submissionId),
							eq(submissionFiles.isSystemGenerated, true),
							notExists(
								(tx || db)
									.select({ id: submissionRecords.id })
									.from(submissionRecords)
									.where(eq(submissionRecords.fileId, submissionFiles.id)),
							),
						),
					)
					.returning({ id: submissionFiles.id });
				logger.info(
					LOG_MODULE,
					`Deleted '${deletedFiles.length}' empty system-generated Submission Files for submissionId '${submissionId}'`,
				);
				return deletedFiles.map((file) => file.id);
			} catch (error) {
				logger.error(
					LOG_MODULE,
					`Failed deleting empty system-generated Submission Files by submissionId '${submissionId}'`,
					error,
				);
				throw new ServiceUnavailable();
			}
		},

		/**
		 * Deletes the files associated with a specific submission ID.
		 * This function does not delete cascadeingly related submission records, it will throw an error if
		 * foreign key constraints are violated.
		 * @param submissionId
		 * @param tx
		 * @returns
		 */
		deleteBySubmissionId: async (
			submissionId: number,
			tx?: RepositoryTransaction<SubmissionFile>,
		): Promise<number[]> => {
			try {
				const deletedFiles = await (tx || db)
					.delete(submissionFiles)
					.where(eq(submissionFiles.submissionId, submissionId))
					.returning({ id: submissionFiles.id });
				logger.info(LOG_MODULE, `Deleted '${deletedFiles.length}' Submission Files for submissionId '${submissionId}'`);
				return deletedFiles.map((file) => file.id);
			} catch (error) {
				logger.error(LOG_MODULE, `Failed deleting Submission Files by submissionId '${submissionId}'`, error);
				throw new ServiceUnavailable();
			}
		},
	};
};

export default submissionFilesRepository;
