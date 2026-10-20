export enum SubmissionStatus {
	InProgress = 'In Progress',
	Committed = 'Committed',
}

export interface Submission {
	submissionId: string;
	createdAt: string;
	createdBy: string;
	updatedAt: string;
	updatedBy: string;
	studyName: string;
	status: SubmissionStatus;
}

export const testData: Array<Submission> = [
	{
		submissionId: 'sub-001',
		createdAt: '2026-10-01T09:00:00Z',
		createdBy: 'alice@example.com',
		updatedAt: '2026-10-05T14:30:00Z',
		updatedBy: 'bob@example.com',
		studyName: 'PRISM Cohort A',
		status: SubmissionStatus.Committed,
	},
	{
		submissionId: 'sub-002',
		createdAt: '2026-10-08T11:15:00Z',
		createdBy: 'carol@example.com',
		updatedAt: '2026-10-09T08:45:00Z',
		updatedBy: 'carol@example.com',
		studyName: 'BRCA Follow-up',
		status: SubmissionStatus.Committed,
	},
	{
		submissionId: 'sub-003',
		createdAt: '2026-10-12T16:00:00Z',
		createdBy: 'dave@example.com',
		updatedAt: '2026-10-15T10:00:00Z',
		updatedBy: 'eve@example.com',
		studyName: 'Lung Cancer Registry',
		status: SubmissionStatus.Committed,
	},
];
