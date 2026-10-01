import { expect } from 'chai';
import { describe, it } from 'mocha';

import type { SubmissionRecordWithEntityName } from '../../../../src/repository/submissionRecordsRepository.js';
import { resolveEditStagingConflicts } from '../../../../src/utils/submissionRecordUtils.js';
import { createDeleteRecord, createInsertRecord, createUpdateRecord } from '../../../fixtures/submissionRecords.js';

const plainUpdate = createUpdateRecord(
	{ id: 5, entityName: 'sport' },
	{ systemId: 'SPT1', old: { name: 'Soccer' }, new: { name: 'Football' } },
);

// An ID field change of sport 'SPT1' (sport_id 1 -> 2) and the records staged as its consequence
const idFieldChangeGroup: SubmissionRecordWithEntityName[] = [
	createUpdateRecord(
		{ id: 10, entityName: 'sport', idFieldChange: true },
		{ systemId: 'SPT1', old: { sport_id: '1' }, new: { sport_id: '2' } },
	),
	createDeleteRecord(
		{ id: 11, entityName: 'sport', parentRecord: 10 },
		{ systemId: 'SPT1', data: { sport_id: '1', name: 'Soccer' }, isValid: true, organization: 'league' },
	),
	createInsertRecord({ id: 12, entityName: 'sport', parentRecord: 10 }, { sport_id: '2', name: 'Soccer' }),
	createUpdateRecord(
		{ id: 13, entityName: 'team', fileId: 2, parentRecord: 10 },
		{ systemId: 'TM1', old: { sport_id: '1' }, new: { sport_id: '2' } },
	),
];

describe('Submission Utils - Resolve Edit Staging Conflicts', () => {
	it('returns nothing to replace and no conflicts when nothing is staged', () => {
		const response = resolveEditStagingConflicts({
			directEditKeys: [{ entityName: 'sport', systemId: 'SPT1' }],
			cascadeUpdateKeys: [{ entityName: 'team', systemId: 'TM1' }],
			existingSubmissionRecords: [],
		});
		expect(response).to.eql({ supersededRecordIds: [], conflictingSystemIds: [] });
	});

	it('replaces a plain UPDATE staged for the same entity and systemId', () => {
		const response = resolveEditStagingConflicts({
			directEditKeys: [{ entityName: 'sport', systemId: 'SPT1' }],
			cascadeUpdateKeys: [],
			existingSubmissionRecords: [plainUpdate],
		});
		expect(response).to.eql({ supersededRecordIds: [5], conflictingSystemIds: [] });
	});

	it('does not replace an UPDATE of the same systemId in a different entity', () => {
		const response = resolveEditStagingConflicts({
			directEditKeys: [{ entityName: 'team', systemId: 'SPT1' }],
			cascadeUpdateKeys: [],
			existingSubmissionRecords: [plainUpdate],
		});
		expect(response).to.eql({ supersededRecordIds: [], conflictingSystemIds: [] });
	});

	it('replaces only the parent of an ID field change group, whose cascaded UPDATEs can then be staged again', () => {
		const response = resolveEditStagingConflicts({
			directEditKeys: [{ entityName: 'sport', systemId: 'SPT1' }],
			cascadeUpdateKeys: [{ entityName: 'team', systemId: 'TM1' }],
			existingSubmissionRecords: idFieldChangeGroup,
		});
		expect(response).to.eql({ supersededRecordIds: [10], conflictingSystemIds: [] });
	});

	it('reports a conflict when a direct edit targets a record with a cascaded foreign key UPDATE staged', () => {
		const response = resolveEditStagingConflicts({
			directEditKeys: [{ entityName: 'team', systemId: 'TM1' }],
			cascadeUpdateKeys: [],
			existingSubmissionRecords: idFieldChangeGroup,
		});
		expect(response).to.eql({ supersededRecordIds: [], conflictingSystemIds: ['TM1'] });
	});

	it('reports a conflict when a cascaded foreign key UPDATE targets a record with a direct edit staged', () => {
		const response = resolveEditStagingConflicts({
			directEditKeys: [{ entityName: 'sport', systemId: 'SPT2' }],
			cascadeUpdateKeys: [{ entityName: 'team', systemId: 'TM1' }],
			existingSubmissionRecords: [
				createUpdateRecord(
					{ id: 30, entityName: 'team', fileId: 2 },
					{ systemId: 'TM1', old: { name: 'Lions' }, new: { name: 'Tigers' } },
				),
			],
		});
		expect(response).to.eql({ supersededRecordIds: [], conflictingSystemIds: ['TM1'] });
	});

	it('reports a conflict when a cascaded foreign key UPDATE targets a record cascaded from another ID field change', () => {
		const response = resolveEditStagingConflicts({
			directEditKeys: [{ entityName: 'sport', systemId: 'SPT2' }],
			cascadeUpdateKeys: [{ entityName: 'team', systemId: 'TM1' }],
			existingSubmissionRecords: idFieldChangeGroup,
		});
		expect(response).to.eql({ supersededRecordIds: [], conflictingSystemIds: ['TM1'] });
	});

	it('reports a conflict when two edits of the same request cascade to the same record', () => {
		const response = resolveEditStagingConflicts({
			directEditKeys: [
				{ entityName: 'team', systemId: 'TM1' },
				{ entityName: 'team', systemId: 'TM2' },
			],
			cascadeUpdateKeys: [
				{ entityName: 'game', systemId: 'GM1' },
				{ entityName: 'game', systemId: 'GM1' },
			],
			existingSubmissionRecords: [],
		});
		expect(response).to.eql({ supersededRecordIds: [], conflictingSystemIds: ['GM1'] });
	});

	it('reports a conflict when a cascaded foreign key UPDATE targets a record edited directly in the same request', () => {
		const response = resolveEditStagingConflicts({
			directEditKeys: [
				{ entityName: 'person', systemId: 'PRS1' },
				{ entityName: 'person', systemId: 'PRS2' },
			],
			cascadeUpdateKeys: [{ entityName: 'person', systemId: 'PRS2' }],
			existingSubmissionRecords: [],
		});
		expect(response).to.eql({ supersededRecordIds: [], conflictingSystemIds: ['PRS2'] });
	});
});
