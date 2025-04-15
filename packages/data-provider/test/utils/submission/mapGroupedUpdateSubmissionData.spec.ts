import { expect } from 'chai';
import { describe, it } from 'mocha';

import type { DataRecord } from '@overture-stack/lectern-client';
import type { SubmittedData } from '@overture-stack/lyric-data-model/models';

import { mapGroupedUpdateSubmissionData } from '../../../src/utils/submissionUtils.js';

describe('Submission Utils - Transforms updates from the Submission object into a Record grouped by entityName', () => {
	const todaysDate = new Date();
	it('should return an object grouped by entity name with 1 udpated record', () => {
		const dependant1: SubmittedData = {
			id: 5,
			data: { name: 'tiger', scientificName: 'tigris' },
			dictionaryCategoryId: 20,
			entityName: 'animals',
			isValid: true,
			lastValidSchemaId: 20,
			organization: 'zoo',
			originalSchemaId: 20,
			systemId: 'TGR1425',
			createdAt: todaysDate,
			createdBy: 'me',
			updatedAt: null,
			updatedBy: null,
		};

		const dependentData: Record<string, SubmittedData[]> = { animals: [dependant1] };
		const filterEntity: {
			entityName: string;
			dataField: string;
			dataValue: string;
		}[] = [
			{ entityName: 'animals', dataField: 'scientificName', dataValue: 'tigris' },
			{ entityName: 'plants', dataField: 'scientificName', dataValue: 'tigris' },
		];
		const newDataRecord: DataRecord = {
			scientificName: 'Panthera Tigris',
			description: 'something here',
		};
		const response = mapGroupedUpdateSubmissionData({ dependentData, filterEntity, newDataRecord });
		expect(Object.keys(response).length).to.eq(1);
		expect(Object.keys(response)).to.eql(['animals']);
		expect(response['animals'].length).to.eq(1);
		expect(response['animals'][0]).to.eql({
			systemId: 'TGR1425',
			old: { scientificName: 'tigris' },
			new: { scientificName: 'Panthera Tigris' },
		});
	});
});
