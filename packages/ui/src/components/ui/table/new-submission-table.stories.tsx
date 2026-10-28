import { Meta, StoryObj } from '@storybook/react';

import { NewSubmissionTable } from './NewSubmissionTable';
import { testDictionary } from './utils/mock';

const meta: Meta<typeof NewSubmissionTable> = {
	title: 'Components/NewSubmissionTable',
	component: NewSubmissionTable,
	tags: ['autodocs'],
};
export default meta;

type Story = StoryObj<typeof NewSubmissionTable>;

export const NewSubmissionTableStory: Story = {
	args: {
		newSubmission: [
			{
				id: 231,
				filename: 'participant.tsv',
				records: 500,
			},
			{
				id: 231,
				filename: 'sociodemographic.tsv',
				records: 640,
				error: 'Header does not match',
			},
			{
				id: 231,
				filename: 'diagnosis.tsv',
				records: 320,
				error: 'Header does not match',
			},
			{
				id: 231,
				filename: 'treatment.tsv',
				records: 124,
			},
			{
				id: 231,
				filename: 'testsubjects.txt',
				records: 540,
				error: 'You must select an entity that matches your file',
			},
			{
				id: 231,
				filename: 'specimen.tsv',
				records: 122,
				error: 'You must select an entity that matches your file',
			},
		],
		dictionary: testDictionary,
	},
};
