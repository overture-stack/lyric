import { AppConfig, Dependencies } from '../config/config.js';
import dictionaryRouters from '../routers/dictionaryRouter.js';

import { connect } from '../config/db.js';
import { getLogger } from '../config/logger.js';
import getCategoryUtils from '../utils/categoryUtils.js';
import getDictionaryUtils from '../utils/dictionaryUtils.js';

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

	return {
		configs: deps,
		routers: {
			dictionary: dictionaryRouters(deps),
		},
		utils: {
			dictionary: getDictionaryUtils(deps),
			category: getCategoryUtils(deps),
		},
	};
};

export default provider;
