import { SelectedFields } from 'drizzle-orm/pg-core/query-builders/select.types';
import { SQL, and, eq, or } from 'drizzle-orm/sql';
import { isEmpty } from 'lodash-es';

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
		 * Find an Active Submission in Database
		 * @param selectionFields Specific fields we want to get. Use '{}' (empty Object) to get all the fields from an Active Submission
		 * @param conditions SQL where clause
		 * @returns The Active Submission found
		 */
		select: async (
			selectionFields: SelectedFields | undefined,
			conditions: SQL<unknown> | ((aliases: SelectedFields) => SQL<unknown> | undefined) | undefined,
		): Promise<
			| Submission[]
			| {
					[x: string]: unknown;
			  }[]
		> => {
			logger.debug(LOG_MODULE, `Querying Active Submission`);
			try {
				if (isEmpty(selectionFields)) return await db.select().from(submissions).where(conditions);
				return await db.select(selectionFields).from(submissions).where(conditions);
			} catch (error) {
				logger.error(LOG_MODULE, `Failed querying Active Submission`, error);
				throw new ServiceUnavailable();
			}
		},
		/**
		 * Update a Submission record in database
		 * @param newData Set fields to update
		 * @param whereConditions Where clause
		 * @returns An updated record(s)
		 */
		update: async (newData: any, whereConditions: SQL<unknown>): Promise<Submission[]> => {
			const updated = await db.update(submissions).set(newData).where(whereConditions).returning();
			return updated;
		},

		/**
		 * Get Active Submission by category
		 * @param {number} categoryId Category ID
		 * @returns An Active Submission
		 */
		getActiveSubmissionWithRelations: async (categoryId: number) => {
			try {
				return await db.query.submissions.findFirst({
					where: and(
						eq(submissions.dictionaryCategoryId, categoryId),
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
						udpatedAt: true,
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
