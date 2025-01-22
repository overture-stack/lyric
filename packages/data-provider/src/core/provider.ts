import { AppConfig, BaseDependencies } from '../config/config.js';
import { connect } from '../config/db.js';
import { getLogger } from '../config/logger.js';
import auditController from '../controllers/auditController.js';
import categoryController from '../controllers/categoryController.js';
import dictionaryController from '../controllers/dictionaryController.js';
import submissionController from '../controllers/submissionController.js';
import submittedDataController from '../controllers/submittedDataController.js';
import auditRouter from '../routers/auditRouter.js';
import categoryRouter from '../routers/categoryRouter.js';
import dictionaryRouter from '../routers/dictionaryRouter.js';
import submissionRouter from '../routers/submissionRouter.js';
import submittedDataRouter from '../routers/submittedDataRouter.js';
import auditService from '../services/auditService.js';
import categoryService from '../services/categoryService.js';
import dictionaryService from '../services/dictionaryService.js';
import submissionService from '../services/submission/submission.js';
import submittedDataService from '../services/submittedData/submmittedData.js';
import * as auditUtils from '../utils/auditUtils.js';
import * as convertSqonToQueryUtils from '../utils/convertSqonToQuery.js';
import * as dictionarySchemaRelationUtils from '../utils/dictionarySchemaRelations.js';
import * as dictionaryUtils from '../utils/dictionaryUtils.js';
import * as errorUtils from '../utils/errors.js';
import * as fileUtils from '../utils/fileUtils.js';
import * as schemaUtils from '../utils/schemas.js';
import * as submissionUtils from '../utils/submissionUtils.js';
import * as submittedDataUtils from '../utils/submittedDataUtils.js';
import * as typeUtils from '../utils/types.js';

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
		limits: configData.limits,
		logger: getLogger(configData.logger),
		schemaService: configData.schemaService,
	};

	return {
		configs: baseDeps,
		routers: {
			audit: auditRouter({ baseDependencies: baseDeps, authConfig: configData.auth }),
			category: categoryRouter({ baseDependencies: baseDeps, authConfig: configData.auth }),
			dictionary: dictionaryRouter({ baseDependencies: baseDeps, authConfig: configData.auth }),
			submission: submissionRouter({ baseDependencies: baseDeps, authConfig: configData.auth }),
			submittedData: submittedDataRouter({ baseDependencies: baseDeps, authConfig: configData.auth }),
		},
		controllers: {
			audit: auditController(baseDeps),
			category: categoryController(baseDeps),
			dictionary: dictionaryController(baseDeps),
			submission: submissionController(baseDeps),
			submittedData: submittedDataController(baseDeps),
		},
		services: {
			audit: auditService(baseDeps),
			category: categoryService(baseDeps),
			dictionary: dictionaryService(baseDeps),
			submission: submissionService(baseDeps),
			submittedData: submittedDataService(baseDeps),
		},
		utils: {
			audit: auditUtils,
			convertSqonToQuery: convertSqonToQueryUtils,
			dictionarySchemaRelations: dictionarySchemaRelationUtils,
			dictionary: dictionaryUtils,
			errors: errorUtils,
			file: fileUtils,
			schema: schemaUtils,
			submission: submissionUtils,
			submittedData: submittedDataUtils,
			type: typeUtils,
		},
	};
};

export default provider;
