import organizationRouter from '../routers/organizationRouter.js';
import { AppConfig, BaseDependencies } from '../config/config.js';
import { connect } from '../config/db.js';
import { getLogger } from '../config/logger.js';
import auditController from '../controllers/auditController.js';
import categoryController from '../controllers/categoryController.js';
import dictionaryController from '../controllers/dictionaryController.js';
import submissionController from '../controllers/submissionController.js';
import submittedDataController from '../controllers/submittedDataController.js';
import validationController from '../controllers/validationController.js';
import organizationController from '../controllers/organizationController.js';
import submissionRepository from '../repository/activeSubmissionRepository.js';
import auditRepository from '../repository/auditRepository.js';
import categoryRepository from '../repository/categoryRepository.js';
import dictionaryRepository from '../repository/dictionaryRepository.js';
import submittedDataRepository from '../repository/submittedRepository.js';
import organizationRepository from '../repository/organizationRepository.js';
import auditRouter from '../routers/auditRouter.js';
import categoryRouter from '../routers/categoryRouter.js';
import dictionaryRouter from '../routers/dictionaryRouter.js';
import submissionRouter from '../routers/submissionRouter.js';
import submittedDataRouter from '../routers/submittedDataRouter.js';
import validationRouter from '../routers/validationRouter.js';
import auditService from '../services/auditService.js';
import categoryService from '../services/categoryService.js';
import dictionaryService from '../services/dictionaryService.js';
import submissionService from '../services/submission/submission.js';
import submittedDataService from '../services/submittedData/submmittedData.js';
import validationService from '../services/validationService.js';
import * as auditUtils from '../utils/auditUtils.js';
import * as convertSqonToQueryUtils from '../utils/convertSqonToQuery.js';
import * as dictionarySchemaRelationUtils from '../utils/dictionarySchemaRelations.js';
import * as dictionaryUtils from '../utils/dictionaryUtils.js';
import * as errorUtils from '../utils/errors.js';
import * as schemaUtils from '../utils/schemas.js';
import * as submissionUtils from '../utils/submissionUtils.js';
import * as submittedDataUtils from '../utils/submittedDataUtils.js';
import * as typeUtils from '../utils/types.js';
import { organizations } from '@overture-stack/lyric-data-model/models';
import organizationService from '../services/organizationService.js';

/**
 * The main provider of submission resources
 * @param configData Environment variables required to configure resources
 * @returns A provider to get access to resources
 */
const provider = (configData: AppConfig) => {
	const baseDeps: BaseDependencies = {
		db: connect(configData.db),
		features: configData.features,
		idService: configData.idService,
		logger: getLogger(configData.logger),
		schemaService: configData.schemaService,
		onFinishCommit: configData.onFinishCommit,
	};

	return {
		configs: baseDeps,
		routers: {
			audit: auditRouter({ baseDependencies: baseDeps, authConfig: configData.auth }),
			category: categoryRouter({ baseDependencies: baseDeps, authConfig: configData.auth }),
			dictionary: dictionaryRouter({ baseDependencies: baseDeps, authConfig: configData.auth }),
			submission: submissionRouter({ baseDependencies: baseDeps, authConfig: configData.auth }),
			submittedData: submittedDataRouter({ baseDependencies: baseDeps, authConfig: configData.auth }),
			validator: validationRouter({
				baseDependencies: baseDeps,
				authConfig: configData.auth,
				validatorConfig: configData.validator,
			}),
			organization: organizationRouter({ baseDependencies: baseDeps, authConfig: configData.auth }),
		},
		controllers: {
			audit: auditController(baseDeps),
			category: categoryController(baseDeps),
			dictionary: dictionaryController(baseDeps),
			submission: submissionController({
				baseDependencies: baseDeps,
				authConfig: { enabled: configData.auth.enabled },
			}),
			submittedData: submittedDataController(baseDeps),
			validator: validationController({ baseDependencies: baseDeps, validatorConfig: configData.validator }),
			organizations: organizationController(baseDeps),
		},
		services: {
			audit: auditService(baseDeps),
			category: categoryService(baseDeps),
			dictionary: dictionaryService(baseDeps),
			submission: submissionService(baseDeps),
			submittedData: submittedDataService(baseDeps),
			validation: validationService(baseDeps),
			organization: organizationService(baseDeps),
		},
		repositories: {
			audit: auditRepository(baseDeps),
			category: categoryRepository(baseDeps),
			dictionary: dictionaryRepository(baseDeps),
			submission: submissionRepository(baseDeps),
			submittedData: submittedDataRepository(baseDeps),
			organization: organizationRepository(baseDeps),
		},
		utils: {
			audit: auditUtils,
			convertSqonToQuery: convertSqonToQueryUtils,
			dictionarySchemaRelations: dictionarySchemaRelationUtils,
			dictionary: dictionaryUtils,
			errors: errorUtils,
			schema: schemaUtils,
			submission: submissionUtils,
			submittedData: submittedDataUtils,
			type: typeUtils,
		},
	};
};

export default provider;
