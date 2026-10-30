import submissionProcessorFactory from '../services/submission/submissionProcessor.js';
import type { DataValidationWorkerInput } from './types.js';
import { getWorkerDependencies } from './workerContext.js';

export const processDataValidation = async (message: DataValidationWorkerInput): Promise<number | undefined> => {
	const { submissionId, username, version } = message;

	const dependencies = getWorkerDependencies();

	const submissionProcessor = submissionProcessorFactory.create(dependencies);

	return await submissionProcessor.performDataValidation(submissionId, username, version);
};
