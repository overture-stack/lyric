import type { SubmissionUpdateData } from '@overture-stack/lyric-data-model/models';

import systemIdGenerator from '../external/systemIdGenerator.js';
import createSubmissionRepository from '../repository/activeSubmissionRepository.js';
import createCategoryRepository from '../repository/categoryRepository.js';
import createSubmissionRecordsRepository from '../repository/submissionRecordsRepository.js';
import createSubmittedRepository from '../repository/submittedRepository.js';
import submissionProcessorFactory from '../services/submission/submissionProcessor.js';
import {
	isDeleteSubmissionRecord,
	isInsertSubmissionRecord,
	isUpdateSubmissionRecord,
} from '../utils/submissionUtils.js';
import { type ResultOnCommit, SUBMISSION_STATUS } from '../utils/types.js';
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
	const submittedDataRepo = createSubmittedRepository(dependencies);
	const submissionRecordsRepo = createSubmissionRecordsRepository(dependencies);

	const submissionProcessor = submissionProcessorFactory.create(dependencies);

	// Fetch submission
	const submission = await submissionRepo.getSubmissionById(submissionId);
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

	const recordsToInsert = await submissionRecordsRepo.getBySubmissionId(submissionId, undefined, {
		actionTypes: ['INSERT'],
	});

	// Build inserts for validation
	const insertsToValidate = recordsToInsert.filter(isInsertSubmissionRecord).map(({ entityName, data }) => {
		return {
			data,
			dictionaryCategoryId: categoryId,
			entityName,
			isValid: false, // By default, New Submitted Data is created as invalid until validation proves otherwise
			organization: submission.organization,
			originalSchemaId: currentDictionary.id,
			systemId: generateIdentifier(entityName, data),
			createdBy: username,
		};
	});

	const recordsToDelete = await submissionRecordsRepo.getBySubmissionId(submissionId, undefined, {
		actionTypes: ['DELETE'],
	});

	const deleteDataArray = recordsToDelete.filter(isDeleteSubmissionRecord).map(({ data }) => data);

	const recordsToUpdate = await submissionRecordsRepo.getBySubmissionId(submissionId, undefined, {
		actionTypes: ['UPDATE'],
	});

	const updatesBySystemId = recordsToUpdate
		.filter(isUpdateSubmissionRecord)
		.reduce<Record<string, SubmissionUpdateData>>((acc, { data }) => {
			acc[data.systemId] = data;
			return acc;
		}, {});

	try {
		return await submissionProcessor.performCommitSubmissionAsync({
			dataToValidate: {
				inserts: insertsToValidate,
				submittedData: submittedDataToValidate,
				deletes: deleteDataArray,
				updates: updatesBySystemId,
			},
			submissionId: submission.id,
			dictionary: currentDictionary,
			username: username,
		});
	} catch (error) {
		// Reset the submission status back to VALID so it can be retried
		await submissionRepo.update(submissionId, { status: SUBMISSION_STATUS.VALID, updatedBy: username });
		throw error;
	}
};
