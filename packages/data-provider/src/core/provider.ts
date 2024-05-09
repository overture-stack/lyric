import * as _ from 'lodash-es';
import { AppConfig, BaseDependencies, Dependencies } from '../config/config.js';
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
	const deps: Dependencies = {
		db: connect(configData.db),
		logger: getLogger(configData.logger),
		config: configData,
	};

	const baseDeps: BaseDependencies = _.omit(deps, ['config']);

	return {
		configs: deps,
		routers: {
			dictionary: dictionaryRouters(deps),
			submission: submissionRouters(baseDeps),
			submittedData: submittedDataRouters(baseDeps),
		},
		utils: {
			dictionary: getDictionaryUtils(deps),
			category: getCategoryUtils(baseDeps),
			submission: getSubmissionUtils(baseDeps),
			submittedData: getSubmittedDataUtils(baseDeps),
		},
	};
};

export default provider;
