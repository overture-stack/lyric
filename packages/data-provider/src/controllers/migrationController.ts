import { BaseDependencies } from '../config/config.js';
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE } from '../config/pagination.js';
import createCategoryService from '../services/categoryService.js';
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
	const categoryService = createCategoryService(dependencies);
	const { logger } = dependencies;
	const LOG_MODULE = 'MIGRATION_CONTROLLER';

	return {
		getMigrationById: validateRequest(migrationByIdRequestSchema, async (req, res, next) => {
			try {
				const migrationId = Number(req.params.migrationId);

				logger.info(LOG_MODULE, `Request Migration id '${migrationId}'`);

				const migrationResult = await migrationService.getMigrationById(migrationId);

				if (!migrationResult) {
					const message = `Migration with id '${migrationId}' not found`;
					logger.info(LOG_MODULE, message);
					throw new NotFound(message);
				}
				return res.send(migrationResult);
			} catch (error) {
				next(error);
			}
		}),
		getMigrationsByCategoryId: validateRequest(migrationsByCategoryIdRequestSchema, async (req, res, next) => {
			try {
				const categoryId = Number(req.params.categoryId);
				const page = parseInt(String(req.query.page)) || DEFAULT_PAGE;
				const pageSize = parseInt(String(req.query.pageSize)) || DEFAULT_PAGE_SIZE;

				logger.info(LOG_MODULE, `Request Migrations by category Id '${categoryId}'`);

				const categoryExists = await categoryService.getDetails(categoryId);
				if (!categoryExists) {
					const message = `Category with id '${categoryId}' not found`;
					logger.info(LOG_MODULE, message);
					throw new NotFound(message);
				}

				const migrationsResult = await migrationService.getMigrationsByCategoryId(categoryId, { page, pageSize });

				const response = {
					pagination: {
						currentPage: page,
						pageSize: pageSize,
						totalPages: Math.ceil(migrationsResult.metadata.totalRecords / pageSize),
						totalRecords: migrationsResult.metadata.totalRecords,
					},
					records: migrationsResult.result,
				};

				return res.send(response);
			} catch (error) {
				next(error);
			}
		}),
		getMigrationRecords: validateRequest(migrationDataRequestSchema, async (req, res, next) => {
			try {
				const migrationId = Number(req.params.migrationId);

				const page = parseInt(String(req.query.page)) || DEFAULT_PAGE;
				const pageSize = parseInt(String(req.query.pageSize)) || DEFAULT_PAGE_SIZE;
				const entityNames = req.query.entityNames;
				const organizations = req.query.organizations;
				const isInvalid = req.query.isInvalid === 'true';

				logger.info(LOG_MODULE, `Request Data Migration id '${migrationId}'`);

				const migrationResult = await migrationService.getMigrationById(migrationId);

				if (!migrationResult) {
					const message = `Migration with id '${migrationId}' not found`;
					logger.info(LOG_MODULE, message);
					throw new NotFound(message);
				}

				const submissionRecords = await migrationService.getMigrationRecords(migrationId, {
					page,
					pageSize,
					entityNames,
					organizations,
					isInvalid,
				});

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
