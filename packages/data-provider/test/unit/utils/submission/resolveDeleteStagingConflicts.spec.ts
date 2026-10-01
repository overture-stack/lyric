import { expect } from 'chai';
import { describe, it } from 'mocha';

import type { SubmissionDeleteData } from '@overture-stack/lyric-data-model/models';

import type { SubmissionRecordWithEntityName } from '../../../../src/repository/submissionRecordsRepository.js';
import { resolveDeleteStagingConflicts } from '../../../../src/utils/submissionRecordUtils.js';
import { createDeleteRecord, createUpdateRecord } from '../../../fixtures/submissionRecords.js';

const deleteRecord = (systemId: string): SubmissionDeleteData => ({
	systemId,
	data: { name: 'tiger', color: 'yellow' },
	isValid: true,
	organization: 'zoo',
});

describe('Submission Utils - Resolve Delete Staging Conflicts', () => {
	it('keeps every record and reports no conflicts/duplicates when there are no existing records', () => {
		const recordsToDeleteMap: Record<string, SubmissionDeleteData[]> = {
			animals: [deleteRecord('TGR1425')],
		};
		const response = resolveDeleteStagingConflicts(recordsToDeleteMap, []);
		expect(response).to.eql({
			filteredRecordsToDeleteMap: recordsToDeleteMap,
			conflictingSystemIds: [],
			duplicateSystemIds: [],
		});
	});

	it('reports a conflict and excludes the record when a pending UPDATE exists for the same entity+systemId', () => {
		const recordsToDeleteMap: Record<string, SubmissionDeleteData[]> = {
			animals: [deleteRecord('TGR1425')],
		};
		const existingSubmissionRecords: SubmissionRecordWithEntityName[] = [
			{
				actionType: 'UPDATE',
				entityName: 'animals',
				id: 10,
				fileId: 1,
				state: 'RECEIVED',
				errors: [],
				data: { systemId: 'TGR1425', new: { color: 'orange' }, old: { color: 'yellow' } },
			},
		];
		const response = resolveDeleteStagingConflicts(recordsToDeleteMap, existingSubmissionRecords);
		expect(response).to.eql({
			filteredRecordsToDeleteMap: {},
			conflictingSystemIds: ['TGR1425'],
			duplicateSystemIds: [],
		});
	});

	it('reports a duplicate and excludes the record when a pending DELETE already exists for the same entity+systemId', () => {
		const recordsToDeleteMap: Record<string, SubmissionDeleteData[]> = {
			animals: [deleteRecord('TGR1425')],
		};
		const existingSubmissionRecords: SubmissionRecordWithEntityName[] = [
			{
				actionType: 'DELETE',
				entityName: 'animals',
				id: 12,
				fileId: 1,
				state: 'RECEIVED',
				errors: [],
				data: deleteRecord('TGR1425'),
			},
		];
		const response = resolveDeleteStagingConflicts(recordsToDeleteMap, existingSubmissionRecords);
		expect(response).to.eql({
			filteredRecordsToDeleteMap: {},
			conflictingSystemIds: [],
			duplicateSystemIds: ['TGR1425'],
		});
	});

	it('does not treat a matching systemId in a different entity as a conflict or duplicate', () => {
		const recordsToDeleteMap: Record<string, SubmissionDeleteData[]> = {
			animals: [deleteRecord('TGR1425')],
		};
		const existingSubmissionRecords: SubmissionRecordWithEntityName[] = [
			{
				actionType: 'UPDATE',
				entityName: 'zookeepers',
				id: 10,
				fileId: 1,
				state: 'RECEIVED',
				errors: [],
				data: { systemId: 'TGR1425', new: { name: 'someone' }, old: { name: 'someone else' } },
			},
			{
				actionType: 'DELETE',
				entityName: 'zookeepers',
				id: 11,
				fileId: 1,
				state: 'RECEIVED',
				errors: [],
				data: deleteRecord('TGR1425'),
			},
		];
		const response = resolveDeleteStagingConflicts(recordsToDeleteMap, existingSubmissionRecords);
		expect(response).to.eql({
			filteredRecordsToDeleteMap: recordsToDeleteMap,
			conflictingSystemIds: [],
			duplicateSystemIds: [],
		});
	});

	it('keeps clean records while filtering out conflicting and duplicate ones within the same entity', () => {
		const recordsToDeleteMap: Record<string, SubmissionDeleteData[]> = {
			animals: [deleteRecord('TGR1425'), deleteRecord('BR8912'), deleteRecord('ZBR001')],
		};
		const existingSubmissionRecords: SubmissionRecordWithEntityName[] = [
			{
				actionType: 'UPDATE',
				entityName: 'animals',
				id: 10,
				fileId: 1,
				state: 'RECEIVED',
				errors: [],
				data: { systemId: 'TGR1425', new: { color: 'orange' }, old: { color: 'yellow' } },
			},
			{
				actionType: 'DELETE',
				entityName: 'animals',
				id: 12,
				fileId: 1,
				state: 'RECEIVED',
				errors: [],
				data: deleteRecord('BR8912'),
			},
		];
		const response = resolveDeleteStagingConflicts(recordsToDeleteMap, existingSubmissionRecords);
		expect(response.conflictingSystemIds).to.eql(['TGR1425']);
		expect(response.duplicateSystemIds).to.eql(['BR8912']);
		expect(response.filteredRecordsToDeleteMap['animals']?.map((record) => record.systemId)).to.eql(['ZBR001']);
	});

	it('omits an entity entirely from the filtered map once every one of its records is filtered out', () => {
		const recordsToDeleteMap: Record<string, SubmissionDeleteData[]> = {
			animals: [deleteRecord('TGR1425')],
			plants: [deleteRecord('OAK001')],
		};
		const existingSubmissionRecords: SubmissionRecordWithEntityName[] = [
			{
				actionType: 'UPDATE',
				entityName: 'animals',
				id: 10,
				fileId: 1,
				state: 'RECEIVED',
				errors: [],
				data: { systemId: 'TGR1425', new: { color: 'orange' }, old: { color: 'yellow' } },
			},
		];
		const response = resolveDeleteStagingConflicts(recordsToDeleteMap, existingSubmissionRecords);
		expect(Object.keys(response.filteredRecordsToDeleteMap)).to.eql(['plants']);
		expect(response.filteredRecordsToDeleteMap['plants']?.map((record) => record.systemId)).to.eql(['OAK001']);
	});

	describe('ID field change groups', () => {
		// An ID field change of 'TGR1425' and the records staged as its consequence
		const idFieldChangeGroup: SubmissionRecordWithEntityName[] = [
			createUpdateRecord(
				{ id: 10, entityName: 'animals', idFieldChange: true },
				{ systemId: 'TGR1425', old: { animal_id: '1' }, new: { animal_id: '2' } },
			),
			createDeleteRecord({ id: 11, entityName: 'animals', parentRecord: 10 }, deleteRecord('TGR1425')),
			createUpdateRecord(
				{ id: 13, entityName: 'keepers', fileId: 2, parentRecord: 10 },
				{ systemId: 'KPR001', old: { animal_id: '1' }, new: { animal_id: '2' } },
			),
		];

		it('reports a conflict, not a duplicate, when the systemId has an ID field change staged', () => {
			const response = resolveDeleteStagingConflicts({ animals: [deleteRecord('TGR1425')] }, idFieldChangeGroup);
			expect(response).to.eql({
				filteredRecordsToDeleteMap: {},
				conflictingSystemIds: ['TGR1425'],
				duplicateSystemIds: [],
			});
		});

		it('reports a conflict when the systemId has a foreign key UPDATE cascaded from an ID field change', () => {
			const response = resolveDeleteStagingConflicts({ keepers: [deleteRecord('KPR001')] }, idFieldChangeGroup);
			expect(response.conflictingSystemIds).to.eql(['KPR001']);
			expect(response.filteredRecordsToDeleteMap).to.eql({});
		});

		it('does not treat a DELETE staged as a consequence of an ID field change as a duplicate', () => {
			const consequenceDeleteOnly = idFieldChangeGroup.filter((record) => record.actionType === 'DELETE');
			const response = resolveDeleteStagingConflicts({ animals: [deleteRecord('TGR1425')] }, consequenceDeleteOnly);
			expect(response.duplicateSystemIds).to.eql([]);
			expect(response.filteredRecordsToDeleteMap['animals']?.map((record) => record.systemId)).to.eql(['TGR1425']);
		});
	});
});
