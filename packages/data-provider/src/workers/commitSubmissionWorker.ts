import type { SubmissionUpdateData } from '@overture-stack/lyric-data-model/models';

import systemIdGenerator from '../external/systemIdGenerator.js';
import createSubmissionRepository from '../repository/activeSubmissionRepository.js';
import createCategoryRepository from '../repository/categoryRepository.js';
import submittedRepository from '../repository/submittedRepository.js';
import submissionProcessorFactory from '../services/submission/submissionProcessor.js';
import type { ResultOnCommit } from '../utils/types.js';
import type { CommitWorkerInput } from './types.js';
import { getWorkerDependencies } from './workerContext.js';

/**
 * This function is executed in a worker thread to start processing the commit submission logic.
 * It fetches the data by the submissionId, prepares the data to be validated and passes it to the submission processor.
 * @param message - The input message containing submissionId and username
 * @returns The result of the commit submission process
 */
export const processCommitSubmission = async (message: CommitWorkerInput): Promise<ResultOnCommit> => {
	const { submissionId, username } = message;

	const dependencies = getWorkerDependencies();

	const submissionRepo = createSubmissionRepository(dependencies);
	const categoryRepo = createCategoryRepository(dependencies);
	const submittedDataRepo = submittedRepository(dependencies);

	const submissionProcessor = submissionProcessorFactory.create(dependencies);

	// Fetch submission
	const submission = await submissionRepo.getSubmissionDetailsById(submissionId);
	if (!submission) {
		throw new Error(`Submission '${submissionId}' not found`);
	}

	if (submission.status !== 'COMMITTING') {
		throw new Error(`Submission '${submissionId}' is not in COMMITTING status`);
	}

	const categoryId = submission.dictionaryCategory.id;

	// Fetch dictionary
	const currentDictionary = await categoryRepo.getActiveDictionaryByCategory(categoryId);
	if (!currentDictionary) {
		throw new Error(`Dictionary in category '${categoryId}' not found`);
	}

	// Fetch submitted data
	const { getSubmittedDataByCategoryIdAndOrganization } = submittedDataRepo;
	const submittedDataToValidate = await getSubmittedDataByCategoryIdAndOrganization(
		categoryId,
		submission?.organization,
	);

	const { generateIdentifier } = systemIdGenerator(dependencies);

	// Build inserts for validation
	const insertsToValidate = submission.data?.inserts
		? Object.entries(submission.data.inserts).flatMap(([entityName, submissionData]) => {
				return submissionData.records.map((record) => ({
					data: record,
					dictionaryCategoryId: categoryId,
					entityName,
					isValid: false, // By default, New Submitted Data is created as invalid until validation proves otherwise
					organization: submission.organization,
					originalSchemaId: currentDictionary.id,
					systemId: generateIdentifier(entityName, record),
					createdBy: username,
				}));
			})
		: [];

	const deleteDataArray = submission.data?.deletes
		? Object.entries(submission.data.deletes).flatMap(([_entityName, submissionDeleteData]) => {
				return submissionDeleteData;
			})
		: [];

	const updateDataArray =
		submission.data?.updates &&
		Object.entries(submission.data.updates).reduce<Record<string, SubmissionUpdateData>>(
			(acc, [_entityName, submissionUpdateData]) => {
				submissionUpdateData.forEach((record) => {
					acc[record.systemId] = record;
				});
				return acc;
			},
			{},
		);

	return await submissionProcessor.performCommitSubmissionAsync({
		dataToValidate: {
			inserts: insertsToValidate,
			submittedData: submittedDataToValidate,
			deletes: deleteDataArray,
			updates: updateDataArray,
		},
		submissionId: submission.id,
		dictionary: currentDictionary,
		username: username,
	});
};
