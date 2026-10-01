import type { SubmissionDeleteData, SubmissionUpdateData } from '@overture-stack/lyric-data-model/models';

import systemIdGenerator from '../external/systemIdGenerator.js';
import createSubmissionRepository, {
	type SubmissionWithDictionaryAndCategoryRepositoryRecord,
} from '../repository/activeSubmissionRepository.js';
import createCategoryRepository from '../repository/categoryRepository.js';
import createSubmissionRecordsRepository from '../repository/submissionRecordsRepository.js';
import createSubmittedRepository from '../repository/submittedRepository.js';
import submissionProcessorFactory from '../services/submission/submissionProcessor.js';
import {
	isDeleteSubmissionRecord,
	isInsertSubmissionRecord,
	isUpdateSubmissionRecord,
} from '../utils/submissionRecordUtils.js';
import { type ResultOnCommit, SUBMISSION_STATUS } from '../utils/types.js';
import type { CommitWorkerInput } from './types.js';
import { getWorkerDependencies } from './workerContext.js';

const LOG_MODULE = 'COMMIT_SUBMISSION_WORKER';

/**
 * This function is executed in a worker thread to start processing the commit submission logic.
 * It fetches the data by the submissionId, prepares the data to be validated and passes it to the submission processor.
 *
 * The commit only runs if the Submission has status `COMMITTING` and the version that was verified when the commit
 * was requested. Otherwise an error is thrown without changing anything.
 * If the commit fails after it started, the Submission status is reset back to `VALID` so it can be retried.
 * @param message - The input message containing submissionId, username and the version to commit
 * @returns The result of the commit submission process
 */
export const processCommitSubmission = async (message: CommitWorkerInput): Promise<ResultOnCommit> => {
	const { submissionId, username, version } = message;

	const dependencies = getWorkerDependencies();
	const { logger } = dependencies;

	const submissionRepo = createSubmissionRepository(dependencies);

	// Fetch submission
	const submission = await submissionRepo.getSubmissionById(submissionId);
	if (!submission) {
		throw new Error(`Submission '${submissionId}' not found`);
	}

	if (submission.status !== SUBMISSION_STATUS.COMMITTING || submission.version !== version) {
		throw new Error(
			`Commit of Submission '${submissionId}' for version '${version}' was not started: the Submission has status '${submission.status}' and version '${submission.version}'`,
		);
	}

	try {
		return await commitSubmissionData({ submission, username, version });
	} catch (error) {
		// Reset the submission status back to VALID so it can be retried, unless it has changed in the meantime
		try {
			const resetSubmission = await submissionRepo.updateWithConditions({
				submissionId,
				newData: { status: SUBMISSION_STATUS.VALID, updatedBy: username },
				expectedStatuses: [SUBMISSION_STATUS.COMMITTING],
				expectedVersion: version,
			});
			if (resetSubmission) {
				logger.info(LOG_MODULE, `Commit of Submission '${submissionId}' failed, status reset to 'VALID'`);
			}
		} catch (resetError) {
			logger.error(
				LOG_MODULE,
				`Failed to reset status of Submission '${submissionId}' after a failed commit`,
				resetError,
			);
		}
		throw error;
	}
};

/**
 * Prepares the records of a Submission in `COMMITTING` status and commits them through the submission processor.
 * @param params
 * @param params.submission The Submission to commit
 * @param params.username User who performs the action
 * @param params.version Submission version verified when the commit was requested
 * @returns The result of the commit submission process
 */
const commitSubmissionData = async ({
	submission,
	username,
	version,
}: {
	submission: SubmissionWithDictionaryAndCategoryRepositoryRecord;
	username: string;
	version: number;
}): Promise<ResultOnCommit> => {
	const dependencies = getWorkerDependencies();

	const categoryRepo = createCategoryRepository(dependencies);
	const submittedDataRepo = createSubmittedRepository(dependencies);
	const submissionRecordsRepo = createSubmissionRecordsRepository(dependencies);

	const submissionProcessor = submissionProcessorFactory.create(dependencies);

	const submissionId = submission.id;
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
		submission.organization,
	);

	const { generateIdentifier } = systemIdGenerator(dependencies);

	const recordsToInsert = await submissionRecordsRepo.getBySubmissionId(submissionId, undefined, {
		actionTypes: ['INSERT'],
	});

	// Build inserts for validation
	const insertsToValidate = recordsToInsert.records.filter(isInsertSubmissionRecord).map(({ entityName, data }) => {
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

	const deleteDataByEntityName = recordsToDelete.records
		.filter(isDeleteSubmissionRecord)
		.reduce<Record<string, SubmissionDeleteData[]>>((acc, { entityName, data }) => {
			if (!acc[entityName]) {
				acc[entityName] = [];
			}
			acc[entityName].push(data);
			return acc;
		}, {});

	const recordsToUpdate = await submissionRecordsRepo.getBySubmissionId(submissionId, undefined, {
		actionTypes: ['UPDATE'],
	});

	const updatesBySystemId = recordsToUpdate.records
		.filter(isUpdateSubmissionRecord)
		.reduce<Record<string, SubmissionUpdateData>>((acc, { data }) => {
			acc[data.systemId] = data;
			return acc;
		}, {});

	return await submissionProcessor.performCommitSubmissionAsync({
		dataToValidate: {
			inserts: insertsToValidate,
			submittedData: submittedDataToValidate,
			deletes: deleteDataByEntityName,
			updates: updatesBySystemId,
		},
		submissionId,
		dictionary: currentDictionary,
		username: username,
		version,
	});
};
