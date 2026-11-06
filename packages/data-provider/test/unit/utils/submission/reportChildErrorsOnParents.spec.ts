import { expect } from 'chai';
import { describe, it } from 'mocha';

import type { SubmissionRecordError } from '@overture-stack/lyric-data-model/models';

import type { SubmissionRecordWithEntityName } from '../../../../src/repository/submissionRecordsRepository.js';
import { reportChildErrorsOnParents, type SubmissionErrors } from '../../../../src/utils/submissionRecordUtils.js';

const record = (
	overrides: Partial<SubmissionRecordWithEntityName> &
		Pick<SubmissionRecordWithEntityName, 'id' | 'actionType' | 'entityName'>,
): SubmissionRecordWithEntityName => ({
	appliedByChildren: false,
	data: {},
	errors: null,
	fileId: 1,
	lineNumber: 2,
	parentRecordId: null,
	state: 'RECEIVED',
	...overrides,
});

const invalidSportId: SubmissionRecordError = { fieldName: 'sport_id', reason: 'UNRECOGNIZED_FIELD', fieldValue: 'x' };
const invalidName: SubmissionRecordError = { fieldName: 'name', reason: 'UNRECOGNIZED_FIELD', fieldValue: 'y' };

// A user's update to an ID field (1), carried out as a DELETE (2) and an INSERT (3), with a dependent update (4) of the DELETE
const idChangeRecords = [
	record({ id: 1, actionType: 'UPDATE', entityName: 'sport', appliedByChildren: true }),
	record({ id: 2, actionType: 'DELETE', entityName: 'sport', parentRecordId: 1 }),
	record({ id: 3, actionType: 'INSERT', entityName: 'sport', parentRecordId: 1 }),
	record({ id: 4, actionType: 'UPDATE', entityName: 'team', parentRecordId: 2 }),
];

describe('Submission Utils - Report Child Errors On Parents', () => {
	it('returns the errors unchanged when no child record has errors', () => {
		const errors: SubmissionErrors = { updates: { team: [] } };

		expect(reportChildErrorsOnParents(idChangeRecords, {})).to.eql({});
		expect(reportChildErrorsOnParents(idChangeRecords, errors)).to.eql(errors);
	});

	it('reports the errors of every direct child on the record they carry out, under its own action type', () => {
		const errors: SubmissionErrors = {
			inserts: { sport: [{ recordId: 3, errors: [invalidSportId] }] },
			deletes: { sport: [{ recordId: 2, errors: [invalidName] }] },
		};

		const response = reportChildErrorsOnParents(idChangeRecords, errors);

		expect(response.inserts).to.eql(errors.inserts);
		expect(response.deletes).to.eql(errors.deletes);
		expect(response.updates).to.eql({ sport: [{ recordId: 1, errors: [invalidName, invalidSportId] }] });
	});

	it('does not report the errors of a grandchild on the user record', () => {
		const errors: SubmissionErrors = { updates: { team: [{ recordId: 4, errors: [invalidName] }] } };

		const response = reportChildErrorsOnParents(idChangeRecords, errors);

		expect(response).to.eql(errors);
	});

	it("does not report errors on a parent that is applied by itself, such as a deleted record's dependents' parent", () => {
		const records = [
			record({ id: 1, actionType: 'DELETE', entityName: 'sport' }),
			record({ id: 2, actionType: 'DELETE', entityName: 'team', parentRecordId: 1 }),
		];
		const errors: SubmissionErrors = { deletes: { team: [{ recordId: 2, errors: [invalidName] }] } };

		expect(reportChildErrorsOnParents(records, errors)).to.eql(errors);
	});
});
