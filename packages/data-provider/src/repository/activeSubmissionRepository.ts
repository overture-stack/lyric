import { and, eq, or } from 'drizzle-orm/sql';

import { NewSubmission, Submission, submissions } from '@overture-stack/lyric-data-model';

import { BaseDependencies } from '../config/config.js';
import { ServiceUnavailable } from '../utils/errors.js';
import { ActiveSubmissionSummaryRepository, BooleanTrueObject } from '../utils/types.js';

const repository = (dependencies: BaseDependencies) => {
	const LOG_MODULE = 'ACTIVE_SUBMISSION_REPOSITORY';
	const { db, logger } = dependencies;

	const getActiveSubmissionColumns: BooleanTrueObject = {
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

	const getActiveSubmissionRelations = {
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
		 * @param {any} newData Set fields to update
		 * @returns An updated record
		 */
		update: async (submissionId: number, newData: Partial<Submission>): Promise<Submission> => {
			try {
				const resultUpdate = await db
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
		 * Get Active Submission by category
		 * @param {Object} filterParams
		 * @param {number} filterParams.categoryId Category ID
		 * @param {string} filterParams.userName User Name
		 * @returns One or many Active Submissions
		 */
		getActiveSubmissionsWithRelationsByCategory: async ({
			categoryId,
			userName,
		}: {
			categoryId: number;
			userName: string;
		}): Promise<ActiveSubmissionSummaryRepository[] | undefined> => {
			try {
				return await db.query.submissions.findMany({
					where: and(
						eq(submissions.dictionaryCategoryId, categoryId),
						eq(submissions.createdBy, userName),
						or(eq(submissions.status, 'OPEN'), eq(submissions.status, 'VALID'), eq(submissions.status, 'INVALID')),
					),
					columns: getActiveSubmissionColumns,
					with: getActiveSubmissionRelations,
				});
			} catch (error) {
				logger.error(LOG_MODULE, `Failed querying Active Submission with relations`, error);
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
		}): Promise<ActiveSubmissionSummaryRepository | undefined> => {
			try {
				return await db.query.submissions.findFirst({
					where: and(
						eq(submissions.dictionaryCategoryId, categoryId),
						eq(submissions.createdBy, userName),
						eq(submissions.organization, organization),
						or(eq(submissions.status, 'OPEN'), eq(submissions.status, 'VALID'), eq(submissions.status, 'INVALID')),
					),
					columns: getActiveSubmissionColumns,
					with: getActiveSubmissionRelations,
				});
			} catch (error) {
				logger.error(LOG_MODULE, `Failed querying Active Submission with relations`, error);
				throw new ServiceUnavailable();
			}
		},

		/**
		 * Get Active Submission by Submission ID
		 * @param {number} submissionId Submission ID
		 * @returns One Active Submission
		 */
		getActiveSubmissionWithRelationsById: async (
			submissionId: number,
		): Promise<ActiveSubmissionSummaryRepository | undefined> => {
			try {
				return await db.query.submissions.findFirst({
					where: and(
						eq(submissions.id, submissionId),
						or(eq(submissions.status, 'OPEN'), eq(submissions.status, 'VALID'), eq(submissions.status, 'INVALID')),
					),
					columns: getActiveSubmissionColumns,
					with: getActiveSubmissionRelations,
				});
			} catch (error) {
				logger.error(LOG_MODULE, `Failed querying Active Submission with relations`, error);
				throw new ServiceUnavailable();
			}
		},
	};
};

export default repository;
