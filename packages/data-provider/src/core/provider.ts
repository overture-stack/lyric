import * as _ from 'lodash-es';
import { AppConfig, BaseDependencies } from '../config/config.js';
import { connect } from '../config/db.js';
import { getLogger } from '../config/logger.js';
import dictionaryRouters from '../routers/dictionaryRouter.js';
import submissionRouters from '../routers/submissionRouter.js';
import submittedDataRouters from '../routers/submittedDataRouter.js';
import getCategoryUtils from '../utils/categoryUtils.js';
import getDictionaryUtils from '../utils/dictionaryUtils.js';
import getSubmissionUtils from '../utils/submissionUtils.js';
import getSubmittedDataUtils from '../utils/submittedDataUtils.js';

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
			dictionary: dictionaryRouters(baseDeps),
			submission: submissionRouters(baseDeps),
			submittedData: submittedDataRouters(baseDeps),
		},
		utils: {
			dictionary: getDictionaryUtils(baseDeps),
			category: getCategoryUtils(baseDeps),
			submission: getSubmissionUtils(baseDeps),
			submittedData: getSubmittedDataUtils(baseDeps),
		},
	};
};

export default provider;
