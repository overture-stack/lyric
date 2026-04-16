import { BaseDependencies } from '../config/config.js';
import createMigrationService from '../services/migrationService.js';
import { NotFound } from '../utils/errors.js';
import { validateRequest } from '../utils/requestValidation.js';
import {
	migrationByIdRequestSchema,
	migrationDataRequestSchema,
	migrationsByCategoryIdRequestSchema,
} from '../utils/schemas.js';

const controller = (dependencies: BaseDependencies) => {
	const migrationService = createMigrationService(dependencies);
	const { logger } = dependencies;
	const LOG_MODULE = 'MIGRATION_CONTROLLER';
	const defaultPage = 1;
	const defaultPageSize = 20;

	return {
		getMigrationById: validateRequest(migrationByIdRequestSchema, async (req, res, next) => {
			try {
				const migrationId = Number(req.params.migrationId);

				logger.info(LOG_MODULE, `Request Migration id '${migrationId}'`);

				const submission = await migrationService.getMigrationById(migrationId);

				if (!submission) {
					throw new NotFound('Submission not found');
				}
				return res.send(submission);
			} catch (error) {
				next(error);
			}
		}),
		getMigrationsByCategoryId: validateRequest(migrationsByCategoryIdRequestSchema, async (req, res, next) => {
			try {
				const categoryId = Number(req.params.categoryId);
				const page = parseInt(String(req.query.page)) || defaultPage;
				const pageSize = parseInt(String(req.query.pageSize)) || defaultPageSize;

				logger.info(LOG_MODULE, `Request Migrations by category Id '${categoryId}'`);

				const submissions = await migrationService.getMigrationsByCategoryId(categoryId, { page, pageSize });

				if (submissions.result.length === 0) {
					throw new NotFound('Submissions not found');
				}

				const response = {
					pagination: {
						currentPage: page,
						pageSize: pageSize,
						totalPages: Math.ceil(submissions.metadata.totalRecords / pageSize),
						totalRecords: submissions.metadata.totalRecords,
					},
					records: submissions.result,
				};

				return res.send(response);
			} catch (error) {
				next(error);
			}
		}),
		getMigrationRecords: validateRequest(migrationDataRequestSchema, async (req, res, next) => {
			try {
				const migrationId = Number(req.params.migrationId);

				const page = parseInt(String(req.query.page)) || defaultPage;
				const pageSize = parseInt(String(req.query.pageSize)) || defaultPageSize;
				const entityNames = req.query.entityNames;
				const organizations = req.query.organizations;
				const isInvalid = req.query.isInvalid === 'true';

				logger.info(LOG_MODULE, `Request Data Migration id '${migrationId}'`);

				const submissionRecords = await migrationService.getMigrationRecords(migrationId, {
					page,
					pageSize,
					entityNames,
					organizations,
					isInvalid,
				});

				if (submissionRecords.result.length === 0) {
					throw new NotFound('Records not found for the specified migration');
				}

				const response = {
					pagination: {
						currentPage: page,
						pageSize: pageSize,
						totalPages: Math.ceil(submissionRecords.metadata.totalRecords / pageSize),
						totalRecords: submissionRecords.metadata.totalRecords,
					},
					records: submissionRecords.result,
				};

				return res.send(response);
			} catch (error) {
				next(error);
			}
		}),
	};
};

export default controller;
