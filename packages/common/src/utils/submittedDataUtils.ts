import { Dependencies } from '../config/config.js';
import submittedRepository from '../repository/submittedRepository.js';

const utils = (dependencies: Dependencies) => {
	const LOG_MODULE = 'SUBMITTED_DATA_UTILS';
	const { logger } = dependencies;
	const submissionRepo = submittedRepository(dependencies);
	return {};
};
