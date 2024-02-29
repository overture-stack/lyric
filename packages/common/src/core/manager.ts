import { AppConfig, Dependencies } from '../config/config.js';
import dictionaryRouters from '../routers/dictionaryRouter.js';

import { connect } from '../config/db.js';
import { getLogger } from '../config/logger.js';
import getCategoryUtils from '../utils/categoryUtils.js';
import getDictionaryUtils from '../utils/dictionaryUtils.js';

const manager = (configData: AppConfig) => {
	const deps: Dependencies = {
		db: connect(configData.db),
		logger: getLogger(configData.logger),
		config: configData,
	};

	return {
		getConfig: deps,
		getRouters: {
			dictionaryRouters: dictionaryRouters(deps),
		},
		getFunctions: {
			dictionaryFunctions: getDictionaryUtils(deps),
			categoryFunctions: getCategoryUtils(deps),
		},
	};
};

export default manager;
