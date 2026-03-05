import { parentPort } from 'node:worker_threads';

import type { DbConfig } from '@overture-stack/lyric-data-model';
import type { SubmissionUpdateData } from '@overture-stack/lyric-data-model/models';

import type { BaseDependencies } from '../config/config.js';
import { connect } from '../config/db.js';
import { getLogger } from '../config/logger.js';
import systemIdGenerator from '../external/systemIdGenerator.js';
import createSubmissionRepository from '../repository/activeSubmissionRepository.js';
import createCategoryRepository from '../repository/categoryRepository.js';
import submittedRepository from '../repository/submittedRepository.js';
import { default as createSubmissionProcessor } from '../services/submission/submissionProcessor.js';

type WorkerMessage = {
	categoryId: number;
	submissionId: number;
	username: string;
	dbConfig: DbConfig;
	idService?: BaseDependencies['idService'];
};

parentPort?.on('message', async (message: WorkerMessage) => {
	try {
		await processCommitSubmission(message);
		parentPort?.postMessage({ success: true });
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		parentPort?.postMessage({ success: false, errorMessage });
	}
});

async function processCommitSubmission(message: WorkerMessage) {
	const { categoryId, submissionId, username, dbConfig, idService } = message;

	const dependencies: BaseDependencies = {
		db: connect(dbConfig),
		logger: getLogger({ level: 'info' }),
		idService: idService,
	};

	const submissionRepo = createSubmissionRepository(dependencies);
	const categoryRepo = createCategoryRepository(dependencies);
	const submittedDataRepo = submittedRepository(dependencies);

	const submissionProcessor = createSubmissionProcessor(dependencies);

	// Fetch submission
	const submission = await submissionRepo.getSubmissionDetailsById(submissionId);
	if (!submission) {
		throw new Error(`Submission '${submissionId}' not found`);
	}

	// Check if submission is in COMMITTING status

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
		? Object.entries(submission.data.deletes).flatMap(([entityName, submissionDeleteData]) => {
				return submissionDeleteData;
			})
		: [];

	const updateDataArray =
		submission.data?.updates &&
		Object.entries(submission.data.updates).reduce<Record<string, SubmissionUpdateData>>(
			(acc, [entityName, submissionUpdateData]) => {
				submissionUpdateData.forEach((record) => {
					acc[record.systemId] = record;
				});
				return acc;
			},
			{},
		);

	await submissionProcessor.performCommitSubmissionAsync({
		dataToValidate: {
			inserts: insertsToValidate,
			submittedData: submittedDataToValidate,
			deletes: deleteDataArray,
			updates: updateDataArray,
		},
		submissionId: submission.id,
		dictionary: currentDictionary,
		username: username,
		onFinishCommit: dependencies.onFinishCommit,
	});
}
