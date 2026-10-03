import { expect } from 'chai';
import { describe, it } from 'mocha';

import type { SubmissionDeleteData } from '@overture-stack/lyric-data-model/models';

import type { SubmissionRecordWithEntityName } from '../../../../src/repository/submissionRecordsRepository.js';
import {
	type EditStagingRecord,
	type IncomingParentEdit,
	resolveStagedEditReplacements,
} from '../../../../src/utils/submissionRecordUtils.js';
import { createDeleteRecord, createInsertRecord, createUpdateRecord } from '../../../fixtures/submissionRecords.js';

const organization = 'league';

const deleteData = (systemId: string): SubmissionDeleteData => ({
	systemId,
	data: { id: systemId },
	isValid: true,
	organization,
});

// A plain UPDATE of team 'TM1'
const plainUpdate = createUpdateRecord(
	{ id: 5, entityName: 'team' },
	{ systemId: 'TM1', old: { name: 'Lions' }, new: { name: 'Lions FC' } },
);

// An ID field change of sport 'SPT1' (sport_id 1 -> 2) and the records staged as its consequence
const idFieldChangeGroup: SubmissionRecordWithEntityName[] = [
	createUpdateRecord(
		{ id: 10, entityName: 'sport', idFieldChange: true },
		{ systemId: 'SPT1', old: { sport_id: '1' }, new: { sport_id: '2' } },
	),
	createDeleteRecord({ id: 11, entityName: 'sport', parentRecord: 10 }, deleteData('SPT1')),
	createInsertRecord({ id: 12, entityName: 'sport', parentRecord: 10 }, { sport_id: '2', name: 'Soccer' }),
	createUpdateRecord(
		{ id: 13, entityName: 'team', fileId: 2, parentRecord: 10 },
		{ systemId: 'TM1', old: { sport_id: '1' }, new: { sport_id: '2' } },
	),
];

// A delete by systemId of sport 'SPT2' and the DELETEs of its dependents staged as its consequence
const deleteGroup: SubmissionRecordWithEntityName[] = [
	createDeleteRecord({ id: 30, entityName: 'sport' }, deleteData('SPT2')),
	createDeleteRecord({ id: 31, entityName: 'team', fileId: 3, parentRecord: 30 }, deleteData('TM3')),
	createDeleteRecord({ id: 32, entityName: 'player', fileId: 4, parentRecord: 30 }, deleteData('PLR3')),
];

// A delete by systemId of team 'TM4', which has no dependents
const directDelete = createDeleteRecord({ id: 40, entityName: 'team' }, deleteData('TM4'));

const updateEdit = (
	entityName: string,
	systemId: string,
	consequences: EditStagingRecord[] = [],
): IncomingParentEdit => ({
	entityName,
	systemId,
	actionType: 'UPDATE',
	idFieldChange: consequences.length > 0,
	consequences,
});

const deleteEdit = (
	entityName: string,
	systemId: string,
	consequences: EditStagingRecord[] = [],
): IncomingParentEdit => ({
	entityName,
	systemId,
	actionType: 'DELETE',
	idFieldChange: false,
	consequences,
});

const cascadeUpdate = (entityName: string, systemId: string): EditStagingRecord => ({
	entityName,
	systemId,
	actionType: 'UPDATE',
});

const dependentDelete = (entityName: string, systemId: string): EditStagingRecord => ({
	entityName,
	systemId,
	actionType: 'DELETE',
});

describe('Submission Utils - Resolve Staged Edit Replacements', () => {
	describe('Replacement', () => {
		it('replaces nothing and stages the edit when nothing is staged', () => {
			const edit = updateEdit('sport', 'SPT1', [cascadeUpdate('team', 'TM1')]);

			const response = resolveStagedEditReplacements({ incomingEdits: [edit], existingSubmissionRecords: [] });

			expect(response).to.eql({ replacedRecords: [], editsToStage: [edit], conflicts: [] });
		});

		it('replaces a staged UPDATE with an UPDATE of the same entity and systemId, listing the discarded change', () => {
			const edit = updateEdit('team', 'TM1');

			const response = resolveStagedEditReplacements({
				incomingEdits: [edit],
				existingSubmissionRecords: [plainUpdate],
			});

			expect(response.replacedRecords).to.eql([
				{
					recordId: 5,
					systemId: 'TM1',
					entityName: 'team',
					actionType: 'UPDATE',
					idFieldChange: false,
					data: { systemId: 'TM1', old: { name: 'Lions' }, new: { name: 'Lions FC' } },
				},
			]);
			expect(response.editsToStage).to.eql([edit]);
			expect(response.conflicts).to.eql([]);
		});

		it('does not replace a staged record of the same systemId in a different entity', () => {
			const response = resolveStagedEditReplacements({
				incomingEdits: [updateEdit('sport', 'TM1')],
				existingSubmissionRecords: [plainUpdate],
			});

			expect(response.replacedRecords).to.eql([]);
			expect(response.conflicts).to.eql([]);
		});

		it('replaces a staged UPDATE with a DELETE', () => {
			const edit = deleteEdit('team', 'TM1');

			const response = resolveStagedEditReplacements({
				incomingEdits: [edit],
				existingSubmissionRecords: [plainUpdate],
			});

			expect(response.replacedRecords.map((record) => record.recordId)).to.eql([5]);
			expect(response.editsToStage).to.eql([edit]);
			expect(response.conflicts).to.eql([]);
		});

		it('replaces a staged DELETE group with an UPDATE, listing only its parent', () => {
			const edit = updateEdit('sport', 'SPT2');

			const response = resolveStagedEditReplacements({
				incomingEdits: [edit],
				existingSubmissionRecords: deleteGroup,
			});

			expect(response.replacedRecords).to.eql([
				{
					recordId: 30,
					systemId: 'SPT2',
					entityName: 'sport',
					actionType: 'DELETE',
					idFieldChange: false,
					data: deleteData('SPT2'),
				},
			]);
			expect(response.editsToStage).to.eql([edit]);
			expect(response.conflicts).to.eql([]);
		});

		it('replaces an ID field change group with a plain UPDATE, listing only its parent', () => {
			const response = resolveStagedEditReplacements({
				incomingEdits: [updateEdit('sport', 'SPT1')],
				existingSubmissionRecords: idFieldChangeGroup,
			});

			expect(response.replacedRecords.map((record) => record.recordId)).to.eql([10]);
			expect(response.replacedRecords[0]?.idFieldChange).to.eq(true);
			expect(response.conflicts).to.eql([]);
		});

		it('replaces an ID field change group with another ID field change, whose cascade can target the same records', () => {
			const edit = updateEdit('sport', 'SPT1', [cascadeUpdate('team', 'TM1')]);

			const response = resolveStagedEditReplacements({
				incomingEdits: [edit],
				existingSubmissionRecords: idFieldChangeGroup,
			});

			expect(response.replacedRecords.map((record) => record.recordId)).to.eql([10]);
			expect(response.editsToStage).to.eql([edit]);
			expect(response.conflicts).to.eql([]);
		});

		it('replaces an ID field change group with a DELETE, whose dependent DELETEs can target its cascaded records', () => {
			const edit = deleteEdit('sport', 'SPT1', [dependentDelete('team', 'TM1')]);

			const response = resolveStagedEditReplacements({
				incomingEdits: [edit],
				existingSubmissionRecords: idFieldChangeGroup,
			});

			expect(response.replacedRecords.map((record) => record.recordId)).to.eql([10]);
			expect(response.editsToStage).to.eql([edit]);
			expect(response.conflicts).to.eql([]);
		});

		it('replaces a plain UPDATE with an ID field change', () => {
			const plainSportUpdate = createUpdateRecord(
				{ id: 6, entityName: 'sport' },
				{ systemId: 'SPT1', old: { name: 'Soccer' }, new: { name: 'Football' } },
			);
			const edit = updateEdit('sport', 'SPT1', [cascadeUpdate('team', 'TM2')]);

			const response = resolveStagedEditReplacements({
				incomingEdits: [edit],
				existingSubmissionRecords: [plainSportUpdate],
			});

			expect(response.replacedRecords.map((record) => record.recordId)).to.eql([6]);
			expect(response.editsToStage).to.eql([edit]);
		});

		it('ignores staged INSERTs, which have no systemId', () => {
			const insert = createInsertRecord({ id: 50, entityName: 'team' }, { team_id: '9', name: 'Bears' });

			const response = resolveStagedEditReplacements({
				incomingEdits: [updateEdit('team', 'TM1')],
				existingSubmissionRecords: [insert],
			});

			expect(response.replacedRecords).to.eql([]);
			expect(response.conflicts).to.eql([]);
		});
	});

	describe('DELETE overlapping DELETE', () => {
		it('changes nothing when a DELETE arrives for a record that already has a direct DELETE staged', () => {
			const response = resolveStagedEditReplacements({
				incomingEdits: [deleteEdit('team', 'TM4')],
				existingSubmissionRecords: [directDelete],
			});

			expect(response).to.eql({ replacedRecords: [], editsToStage: [], conflicts: [] });
		});

		it('changes nothing, including the dependent DELETEs, when the parent of a DELETE group is deleted again', () => {
			const response = resolveStagedEditReplacements({
				incomingEdits: [
					deleteEdit('sport', 'SPT2', [dependentDelete('team', 'TM3'), dependentDelete('player', 'PLR3')]),
				],
				existingSubmissionRecords: deleteGroup,
			});

			expect(response).to.eql({ replacedRecords: [], editsToStage: [], conflicts: [] });
		});

		it('does not stage a direct DELETE of a record that already has a consequence DELETE staged', () => {
			const response = resolveStagedEditReplacements({
				incomingEdits: [deleteEdit('team', 'TM3', [dependentDelete('player', 'PLR3')])],
				existingSubmissionRecords: deleteGroup,
			});

			expect(response).to.eql({ replacedRecords: [], editsToStage: [], conflicts: [] });
		});

		it('skips a dependent DELETE of a record that already has a direct DELETE staged', () => {
			const response = resolveStagedEditReplacements({
				incomingEdits: [deleteEdit('sport', 'SPT9', [dependentDelete('team', 'TM4'), dependentDelete('team', 'TM5')])],
				existingSubmissionRecords: [directDelete],
			});

			expect(response.replacedRecords).to.eql([]);
			expect(response.editsToStage).to.eql([deleteEdit('sport', 'SPT9', [dependentDelete('team', 'TM5')])]);
			expect(response.conflicts).to.eql([]);
		});

		it('skips a dependent DELETE of a record that already has a consequence DELETE from another parent', () => {
			const response = resolveStagedEditReplacements({
				incomingEdits: [deleteEdit('league', 'LG1', [dependentDelete('team', 'TM3')])],
				existingSubmissionRecords: deleteGroup,
			});

			expect(response.editsToStage).to.eql([deleteEdit('league', 'LG1')]);
			expect(response.conflicts).to.eql([]);
		});

		it('skips a dependent DELETE of a record that the same request deletes directly', () => {
			const response = resolveStagedEditReplacements({
				incomingEdits: [deleteEdit('team', 'TM5'), deleteEdit('sport', 'SPT9', [dependentDelete('team', 'TM5')])],
				existingSubmissionRecords: [],
			});

			expect(response.editsToStage).to.eql([deleteEdit('team', 'TM5'), deleteEdit('sport', 'SPT9')]);
			expect(response.conflicts).to.eql([]);
		});
	});

	describe('Conflicts', () => {
		it('rejects an UPDATE of a record staged as a cascaded UPDATE, describing the conflict', () => {
			const response = resolveStagedEditReplacements({
				incomingEdits: [updateEdit('team', 'TM1')],
				existingSubmissionRecords: idFieldChangeGroup,
			});

			expect(response.replacedRecords).to.eql([]);
			expect(response.conflicts).to.have.lengthOf(1);
			expect(response.conflicts[0]).to.deep.include({
				reason: 'TARGETS_CONSEQUENCE_RECORD',
				incomingRecord: { entityName: 'team', systemId: 'TM1', actionType: 'UPDATE' },
				conflictingRecord: { recordId: 13, entityName: 'team', systemId: 'TM1', actionType: 'UPDATE' },
				parentRecord: {
					recordId: 10,
					entityName: 'sport',
					systemId: 'SPT1',
					actionType: 'UPDATE',
					idFieldChange: true,
				},
			});
			expect(response.conflicts[0]?.message).to.include(`'10'`);
		});

		it('rejects an UPDATE of a record staged as a dependent DELETE', () => {
			const response = resolveStagedEditReplacements({
				incomingEdits: [updateEdit('team', 'TM3')],
				existingSubmissionRecords: deleteGroup,
			});

			expect(
				response.conflicts.map(({ reason, conflictingRecord, parentRecord }) => [
					reason,
					conflictingRecord.recordId,
					parentRecord.recordId,
				]),
			).to.eql([['TARGETS_CONSEQUENCE_RECORD', 31, 30]]);
			expect(response.conflicts[0]?.parentRecord).to.eql({
				recordId: 30,
				entityName: 'sport',
				systemId: 'SPT2',
				actionType: 'DELETE',
				idFieldChange: false,
			});
		});

		it('rejects a DELETE of a record staged as a cascaded UPDATE', () => {
			const response = resolveStagedEditReplacements({
				incomingEdits: [deleteEdit('team', 'TM1')],
				existingSubmissionRecords: idFieldChangeGroup,
			});

			expect(response.conflicts.map(({ reason, conflictingRecord }) => [reason, conflictingRecord.recordId])).to.eql([
				['TARGETS_CONSEQUENCE_RECORD', 13],
			]);
		});

		it('rejects an ID field change whose cascaded UPDATE targets a record with a direct UPDATE staged', () => {
			const response = resolveStagedEditReplacements({
				incomingEdits: [updateEdit('sport', 'SPT1', [cascadeUpdate('team', 'TM1')])],
				existingSubmissionRecords: [plainUpdate],
			});

			expect(response.conflicts).to.have.lengthOf(1);
			expect(response.conflicts[0]).to.deep.include({
				reason: 'CONSEQUENCE_COLLISION',
				incomingRecord: { entityName: 'team', systemId: 'TM1', actionType: 'UPDATE' },
				conflictingRecord: { recordId: 5, entityName: 'team', systemId: 'TM1', actionType: 'UPDATE' },
				parentRecord: { entityName: 'sport', systemId: 'SPT1', actionType: 'UPDATE', idFieldChange: true },
			});
		});

		it('rejects an ID field change whose cascaded UPDATE targets a record with a direct DELETE staged', () => {
			const response = resolveStagedEditReplacements({
				incomingEdits: [updateEdit('sport', 'SPT9', [cascadeUpdate('team', 'TM4')])],
				existingSubmissionRecords: [directDelete],
			});

			expect(response.conflicts.map(({ reason, conflictingRecord }) => [reason, conflictingRecord.recordId])).to.eql([
				['CONSEQUENCE_COLLISION', 40],
			]);
		});

		it('rejects an ID field change whose cascaded UPDATE targets a consequence record of another parent', () => {
			const response = resolveStagedEditReplacements({
				incomingEdits: [updateEdit('sport', 'SPT9', [cascadeUpdate('team', 'TM3')])],
				existingSubmissionRecords: deleteGroup,
			});

			expect(response.conflicts.map(({ reason, conflictingRecord }) => [reason, conflictingRecord.recordId])).to.eql([
				['CONSEQUENCE_COLLISION', 31],
			]);
		});

		it('rejects a DELETE whose dependent DELETE targets a record with a direct UPDATE staged', () => {
			const response = resolveStagedEditReplacements({
				incomingEdits: [deleteEdit('sport', 'SPT9', [dependentDelete('team', 'TM1')])],
				existingSubmissionRecords: [plainUpdate],
			});

			expect(
				response.conflicts.map(({ reason, conflictingRecord, parentRecord }) => [
					reason,
					conflictingRecord.recordId,
					parentRecord,
				]),
			).to.eql([
				[
					'CONSEQUENCE_COLLISION',
					5,
					{ entityName: 'sport', systemId: 'SPT9', actionType: 'DELETE', idFieldChange: false },
				],
			]);
		});

		it('rejects a DELETE whose dependent DELETE targets a cascaded UPDATE of another parent', () => {
			const response = resolveStagedEditReplacements({
				incomingEdits: [deleteEdit('league', 'LG1', [dependentDelete('team', 'TM1')])],
				existingSubmissionRecords: idFieldChangeGroup,
			});

			expect(response.conflicts.map(({ conflictingRecord }) => conflictingRecord.recordId)).to.eql([13]);
		});

		it('does not count records removed by the replacement it makes', () => {
			// The ID field change of SPT1 is replaced, which also removes its cascaded UPDATE of TM1
			const response = resolveStagedEditReplacements({
				incomingEdits: [updateEdit('sport', 'SPT1'), updateEdit('team', 'TM1')],
				existingSubmissionRecords: idFieldChangeGroup,
			});

			expect(response.replacedRecords.map((record) => record.recordId)).to.eql([10]);
			expect(response.conflicts).to.eql([]);
		});

		it('rejects two cascaded UPDATEs of the same record within a request', () => {
			const response = resolveStagedEditReplacements({
				incomingEdits: [
					updateEdit('team', 'TM1', [cascadeUpdate('match', 'MT1')]),
					updateEdit('team', 'TM2', [cascadeUpdate('match', 'MT1')]),
				],
				existingSubmissionRecords: [],
			});

			expect(response.conflicts).to.have.lengthOf(1);
			expect(response.conflicts[0]).to.deep.include({
				reason: 'CONSEQUENCE_COLLISION',
				incomingRecord: { entityName: 'match', systemId: 'MT1', actionType: 'UPDATE' },
				conflictingRecord: { entityName: 'match', systemId: 'MT1', actionType: 'UPDATE' },
				parentRecord: { entityName: 'team', systemId: 'TM2', actionType: 'UPDATE', idFieldChange: true },
			});
		});

		it('rejects a cascaded UPDATE of a record that the same request edits directly', () => {
			const response = resolveStagedEditReplacements({
				incomingEdits: [updateEdit('person', 'PR1', [cascadeUpdate('person', 'PR2')]), updateEdit('person', 'PR2')],
				existingSubmissionRecords: [],
			});

			expect(
				response.conflicts.map(({ incomingRecord, conflictingRecord }) => [incomingRecord.systemId, conflictingRecord]),
			).to.eql([['PR2', { entityName: 'person', systemId: 'PR2', actionType: 'UPDATE' }]]);
		});

		it('lists every conflict of a mixed request, alongside the edits that do not conflict', () => {
			const response = resolveStagedEditReplacements({
				incomingEdits: [updateEdit('team', 'TM1'), updateEdit('team', 'TM2'), updateEdit('team', 'TM3')],
				existingSubmissionRecords: [...idFieldChangeGroup, ...deleteGroup],
			});

			expect(response.conflicts.map(({ conflictingRecord }) => conflictingRecord.recordId)).to.eql([13, 31]);
		});

		it('throws when the parent of a staged consequence record is missing', () => {
			const orphanConsequence = createUpdateRecord(
				{ id: 60, entityName: 'team', parentRecord: 99 },
				{ systemId: 'TM6', old: { sport_id: '1' }, new: { sport_id: '2' } },
			);

			expect(() =>
				resolveStagedEditReplacements({
					incomingEdits: [updateEdit('team', 'TM6')],
					existingSubmissionRecords: [orphanConsequence],
				}),
			).to.throw(`Parent record '99'`);
		});
	});
});
