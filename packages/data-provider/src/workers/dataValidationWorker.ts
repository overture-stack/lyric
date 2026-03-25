import submissionProcessorFactory from '../services/submission/submissionProcessor.js';
import type { DataValidationWorkerInput } from './types.js';
import { getWorkerDependencies } from './workerContext.js';

export const processDataValidation = async (message: DataValidationWorkerInput) => {
	const { submissionId } = message;

	const dependencies = getWorkerDependencies();

	const submissionProcessor = submissionProcessorFactory.create(dependencies);

	return await submissionProcessor.performDataValidation(submissionId);
};
