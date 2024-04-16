import { and, eq, or } from 'drizzle-orm/sql';

import { Dependencies } from '../config/config.js';
import { NewSubmission, Submission, submissions } from '../models/submissions.js';
import { ServiceUnavailable } from '../utils/errors.js';

const repository = (dependencies: Dependencies) => {
	const LOG_MODULE = 'ACTIVE_SUBMISSION_REPOSITORY';
	const { db, logger } = dependencies;
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
						or(eq(submissions.state, 'OPEN'), eq(submissions.state, 'VALID'), eq(submissions.state, 'INVALID')),
					),
				});
			} catch (error) {
				logger.error(LOG_MODULE, `Failed getting active Submission`, error);
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
			const updated = await db.update(submissions).set(newData).where(eq(submissions.id, submissionId)).returning();
			return updated[0];
		},

		/**
		 * Get Active Submission by category
		 * @param {number} categoryId Category ID
		 * @param {string} userName User Name
		 * @returns One or many Active Submissions
		 */
		getActiveSubmissionWithRelations: async (categoryId: number, userName: string) => {
			try {
				return await db.query.submissions.findMany({
					where: and(
						eq(submissions.dictionaryCategoryId, categoryId),
						eq(submissions.createdBy, userName),
						or(eq(submissions.state, 'OPEN'), eq(submissions.state, 'VALID'), eq(submissions.state, 'INVALID')),
					),
					columns: {
						id: true,
						state: true,
						organization: true,
						data: true,
						errors: true,
						createdAt: true,
						createdBy: true,
						updatedAt: true,
						updatedBy: true,
					},
					with: {
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
					},
				});
			} catch (error) {
				logger.error(LOG_MODULE, `Failed querying Active Submission with relations`, error);
				throw new ServiceUnavailable();
			}
		},
	};
};

export default repository;
