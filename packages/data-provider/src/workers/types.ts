import type { BaseDependencies } from '../config/config.js';

export type CommitWorkerInput = {
	submissionId: number;
	username: string;
};

export type WorkerContext = {
	dependencies: BaseDependencies;
};

export interface WorkerFunctions {
	commitSubmission(input: CommitWorkerInput): Promise<void>;
}
