import type { BaseDependencies } from '../config/config.js';

export type CommitWorkerInput = {
	categoryId: number;
	submissionId: number;
	username: string;
};

export type WorkerContext = {
	dependencies: BaseDependencies;
};

export interface WorkerFunctions {
	commitSubmission(input: CommitWorkerInput): Promise<void>;
}
