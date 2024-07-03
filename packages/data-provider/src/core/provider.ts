import { AppConfig, BaseDependencies } from '../config/config.js';
import { connect } from '../config/db.js';
import { getLogger } from '../config/logger.js';
import categoryRouter from '../routers/categoryRouter.js';
import dictionaryRouter from '../routers/dictionaryRouter.js';
import submissionRouter from '../routers/submissionRouter.js';
import submittedDataRouter from '../routers/submittedDataRouter.js';
import categoryService from '../services/categoryService.js';
import dictionaryService from '../services/dictionaryService.js';
import submissionService from '../services/submissionService.js';
import submittedDataService from '../services/submittedDataService.js';
import categoryUtils from '../utils/categoryUtils.js';
import dictionaryUtils from '../utils/dictionaryUtils.js';
import submissionUtils from '../utils/submissionUtils.js';
import submittedDataUtils from '../utils/submittedDataUtils.js';

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
			category: categoryRouter(baseDeps),
			dictionary: dictionaryRouter(baseDeps),
			submission: submissionRouter(baseDeps),
			submittedData: submittedDataRouter(baseDeps),
		},
		services: {
			category: categoryService(baseDeps),
			dictionary: dictionaryService(baseDeps),
			submission: submissionService(baseDeps),
			submittedData: submittedDataService(baseDeps),
		},
		utils: {
			category: categoryUtils(baseDeps),
			dictionary: dictionaryUtils(baseDeps),
			submission: submissionUtils(baseDeps),
			submittedData: submittedDataUtils(baseDeps),
		},
	};
};

export default provider;
