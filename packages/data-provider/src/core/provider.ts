import { AppConfig, BaseDependencies } from '../config/config.js';
import { connect } from '../config/db.js';
import { getLogger } from '../config/logger.js';
import auditRouter from '../routers/auditRouter.js';
import categoryRouter from '../routers/categoryRouter.js';
import dictionaryRouter from '../routers/dictionaryRouter.js';
import submissionRouter from '../routers/submissionRouter.js';
import submittedDataRouter from '../routers/submittedDataRouter.js';
import auditService from '../services/auditService.js';
import categoryService from '../services/categoryService.js';
import dictionaryService from '../services/dictionaryService.js';
import submissionService from '../services/submissionService.js';
import submittedDataService from '../services/submittedDataService.js';
import * as dictionaryUtils from '../utils/dictionaryUtils.js';
import * as submissionUtils from '../utils/submissionUtils.js';
import * as submittedDataUtils from '../utils/submittedDataUtils.js';

/**
 * The main provider of submission resources
 * @param configData Environment variables required to configure resources
 * @returns A provider to get access to resources
 */
const provider = (configData: AppConfig) => {
	const baseDeps: BaseDependencies = {
		db: connect(configData.db),
		features: {
			audit: configData.features?.audit,
		},
		idService: configData.idService,
		limits: configData.limits,
		logger: getLogger(configData.logger),
		schemaService: configData.schemaService,
	};

	return {
		configs: baseDeps,
		routers: {
			audit: auditRouter(baseDeps),
			category: categoryRouter(baseDeps),
			dictionary: dictionaryRouter(baseDeps),
			submission: submissionRouter(baseDeps),
			submittedData: submittedDataRouter(baseDeps),
		},
		services: {
			audit: auditService(baseDeps),
			category: categoryService(baseDeps),
			dictionary: dictionaryService(baseDeps),
			submission: submissionService(baseDeps),
			submittedData: submittedDataService(baseDeps),
		},
		utils: {
			dictionary: dictionaryUtils,
			submission: submissionUtils,
			submittedData: submittedDataUtils,
		},
	};
};

export default provider;
