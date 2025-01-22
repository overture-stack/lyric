import { expect } from 'chai';
import { describe, it } from 'mocha';

import type { SubmissionData } from '@overture-stack/lyric-data-model/models';

import { removeItemsFromSubmission } from '../../../src/utils/submissionUtils.js';
import { SUBMISSION_ACTION_TYPE, type SubmissionActionType } from '../../../src/utils/types.js';

describe('Submission Utils - Removes items from submission based on filter parameters', () => {
	const insertDataSubmission: SubmissionData = {
		inserts: {
			sports: {
				batchName: 'sports.tsv',
				records: [
					{
						name: 'Breakdance',
					},
					{
						name: 'Skateboarding',
					},
				],
			},
			food: {
				batchName: 'food.xml',
				records: [
					{
						name: 'Poutine',
					},
				],
			},
		},
	};

	const updateDataSubmission: SubmissionData = {
		updates: {
			sports: [
				{
					systemId: 'QWE987',
					new: { name: 'Basketball 3X3' },
					old: { name: 'Basketball' },
				},
				{
					systemId: 'SWI321',
					new: { name: 'Swimming' },
					old: { name: 'swiming' },
				},
			],
			food: [
				{
					systemId: 'PTO456',
					new: { name: 'Potato' },
					old: { name: 'potahto' },
				},
			],
		},
	};

	const deleteDataSubmission: SubmissionData = {
		deletes: {
			sports: [
				{
					systemId: 'ZXC678',
					entityName: 'sports',
					organization: 'olimpics',
					isValid: true,
					data: { name: 'Baseball' },
				},
				{
					systemId: 'SFT098',
					entityName: 'sports',
					organization: 'olimpics',
					isValid: true,
					data: { name: 'Softball' },
				},
			],
			food: [
				{
					systemId: 'EGG789',
					entityName: 'food',
					organization: 'olimpics',
					isValid: true,
					data: { name: 'Eggpplant' },
				},
			],
		},
	};
	it('should return an empty response when Submission is empty', () => {
		const submissionData: SubmissionData = {};
		const filter: { actionType: SubmissionActionType; entityName: string; index: number | null } = {
			actionType: SUBMISSION_ACTION_TYPE.Values.INSERTS,
			entityName: 'sports',
			index: 0,
		};
		const response = removeItemsFromSubmission(submissionData, filter);
		expect(response).to.eql({});
	});
	it('should returm intact SubmissionData when filter doesnt find anything', () => {
		const fullSubmissionData: SubmissionData = {
			...insertDataSubmission,
			...updateDataSubmission,
			...deleteDataSubmission,
		};
		const filter: { actionType: SubmissionActionType; entityName: string; index: number | null } = {
			actionType: SUBMISSION_ACTION_TYPE.Values.INSERTS,
			entityName: 'animals', // item doesn't belong in the submission
			index: 0,
		};
		const response = removeItemsFromSubmission(fullSubmissionData, filter);
		expect(response).to.eql({
			inserts: {
				sports: {
					batchName: 'sports.tsv',
					records: [
						{
							name: 'Breakdance',
						},
						{
							name: 'Skateboarding',
						},
					],
				},
				food: {
					batchName: 'food.xml',
					records: [
						{
							name: 'Poutine',
						},
					],
				},
			},
			updates: {
				sports: [
					{
						systemId: 'QWE987',
						new: { name: 'Basketball 3X3' },
						old: { name: 'Basketball' },
					},
					{
						systemId: 'SWI321',
						new: { name: 'Swimming' },
						old: { name: 'swiming' },
					},
				],
				food: [
					{
						systemId: 'PTO456',
						new: { name: 'Potato' },
						old: { name: 'potahto' },
					},
				],
			},
			deletes: {
				sports: [
					{
						systemId: 'ZXC678',
						entityName: 'sports',
						organization: 'olimpics',
						isValid: true,
						data: { name: 'Baseball' },
					},
					{
						systemId: 'SFT098',
						entityName: 'sports',
						organization: 'olimpics',
						isValid: true,
						data: { name: 'Softball' },
					},
				],
				food: [
					{
						systemId: 'EGG789',
						entityName: 'food',
						organization: 'olimpics',
						isValid: true,
						data: { name: 'Eggpplant' },
					},
				],
			},
		});
	});
	it('should remove whole inserts object from SubmissionData', () => {
		const insertOnseSubmission: SubmissionData = {
			inserts: {
				sports: {
					batchName: 'sports.tsv',
					records: [
						{
							name: 'Snowboarding',
						},
					],
				},
			},
		};
		const filter: { actionType: SubmissionActionType; entityName: string; index: number | null } = {
			actionType: SUBMISSION_ACTION_TYPE.Values.INSERTS,
			entityName: 'sports',
			index: null,
		};
		const response = removeItemsFromSubmission(insertOnseSubmission, filter);
		expect(response).to.eql({});
	});
	it('should remove whole updates object from SubmissionData', () => {
		const updateOneSubmission: SubmissionData = {
			updates: {
				sports: [
					{
						systemId: 'QWE987',
						new: { name: 'Basketball 3X3' },
						old: { name: 'Basketball' },
					},
				],
			},
		};
		const filter: { actionType: SubmissionActionType; entityName: string; index: number | null } = {
			actionType: SUBMISSION_ACTION_TYPE.Values.UPDATES,
			entityName: 'sports',
			index: null,
		};
		const response = removeItemsFromSubmission(updateOneSubmission, filter);
		expect(response).to.eql({});
	});
	it('should remove whole deletes object from SubmissionData', () => {
		const deleteOneSubmission: SubmissionData = {
			deletes: {
				sports: [
					{
						systemId: 'ZXC678',
						entityName: 'sports',
						organization: 'olimpics',
						isValid: true,
						data: { name: 'Baseball' },
					},
				],
			},
		};
		const filter: { actionType: SubmissionActionType; entityName: string; index: number | null } = {
			actionType: SUBMISSION_ACTION_TYPE.Values.DELETES,
			entityName: 'sports',
			index: null,
		};
		const response = removeItemsFromSubmission(deleteOneSubmission, filter);
		expect(response).to.eql({});
	});
	it('should remove one item from inserts object on SubmissionData', () => {
		const filter: { actionType: SubmissionActionType; entityName: string; index: number | null } = {
			actionType: SUBMISSION_ACTION_TYPE.Values.INSERTS,
			entityName: 'sports',
			index: 1,
		};
		const response = removeItemsFromSubmission(insertDataSubmission, filter);
		expect(response).to.eql({
			inserts: {
				sports: {
					batchName: 'sports.tsv',
					records: [
						{
							name: 'Breakdance',
						},
					],
				},
				food: {
					batchName: 'food.xml',
					records: [
						{
							name: 'Poutine',
						},
					],
				},
			},
		});
	});
	it('should remove one item from updates object on SubmissionData', () => {
		const filter: { actionType: SubmissionActionType; entityName: string; index: number | null } = {
			actionType: SUBMISSION_ACTION_TYPE.Values.UPDATES,
			entityName: 'sports',
			index: 1,
		};
		const response = removeItemsFromSubmission(updateDataSubmission, filter);
		expect(response).to.eql({
			updates: {
				sports: [
					{
						systemId: 'QWE987',
						new: { name: 'Basketball 3X3' },
						old: { name: 'Basketball' },
					},
				],
				food: [
					{
						systemId: 'PTO456',
						new: { name: 'Potato' },
						old: { name: 'potahto' },
					},
				],
			},
		});
	});
	it('should remove one item from deletes object on SubmissionData', () => {
		const filter: { actionType: SubmissionActionType; entityName: string; index: number | null } = {
			actionType: SUBMISSION_ACTION_TYPE.Values.DELETES,
			entityName: 'sports',
			index: 1,
		};
		const response = removeItemsFromSubmission(deleteDataSubmission, filter);
		expect(response).to.eql({
			deletes: {
				sports: [
					{
						systemId: 'ZXC678',
						entityName: 'sports',
						organization: 'olimpics',
						isValid: true,
						data: { name: 'Baseball' },
					},
				],
				food: [
					{
						systemId: 'EGG789',
						entityName: 'food',
						organization: 'olimpics',
						isValid: true,
						data: { name: 'Eggpplant' },
					},
				],
			},
		});
	});
	it('should remove inserts if no items are left on the records array', () => {
		const insertOnseSubmission: SubmissionData = {
			inserts: {
				sports: {
					batchName: 'sports.tsv',
					records: [
						{
							name: 'Snowboarding',
						},
					],
				},
			},
		};

		const filter: { actionType: SubmissionActionType; entityName: string; index: number | null } = {
			actionType: SUBMISSION_ACTION_TYPE.Values.INSERTS,
			entityName: 'sports',
			index: 0,
		};
		const response = removeItemsFromSubmission(insertOnseSubmission, filter);
		expect(response).to.eql({});
	});
	it('should remove updates if no items are left on the array', () => {
		const updateOneSubmission: SubmissionData = {
			updates: {
				sports: [
					{
						systemId: 'QWE987',
						new: { name: 'Basketball 3X3' },
						old: { name: 'Basketball' },
					},
				],
			},
		};
		const filter: { actionType: SubmissionActionType; entityName: string; index: number | null } = {
			actionType: SUBMISSION_ACTION_TYPE.Values.UPDATES,
			entityName: 'sports',
			index: 0,
		};
		const response = removeItemsFromSubmission(updateOneSubmission, filter);
		expect(response).to.eql({});
	});
	it('should remove deletes if no items are left on the array', () => {
		const deleteOneSubmission: SubmissionData = {
			deletes: {
				sports: [
					{
						systemId: 'ZXC678',
						entityName: 'sports',
						organization: 'olimpics',
						isValid: true,
						data: { name: 'Baseball' },
					},
				],
			},
		};
		const filter: { actionType: SubmissionActionType; entityName: string; index: number | null } = {
			actionType: SUBMISSION_ACTION_TYPE.Values.DELETES,
			entityName: 'sports',
			index: 0,
		};
		const response = removeItemsFromSubmission(deleteOneSubmission, filter);
		expect(response).to.eql({});
	});
});
