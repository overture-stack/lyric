import { expect } from 'chai';
import { describe, it } from 'mocha';

import { Dictionary } from '@overture-stack/lyric-data-model';

import { getDictionarySchemaRelations } from '../../src/utils/dictionarySchemaRelations.js';
import { dictionarySportStats, dictionarySportStatsNodeGraph } from './fixtures/dictionarySchemasTestData.js';

describe('Dictionary Schema Relations', () => {
	it('should return the schema children nodes on a Dictionary', () => {
		const result = getDictionarySchemaRelations(dictionarySportStats);

		expect(result).to.deep.equal(dictionarySportStatsNodeGraph);
	});
	it('should return an empty schema children for a schema with no children', () => {
		const dictionarySportStats: Dictionary = {
			id: 1,
			name: 'test dictionary',
			version: '1.0.0',
			dictionary: [
				{
					name: 'sports',
					fields: [
						{ name: 'sport_id', valueType: 'integer' },
						{ name: 'name', valueType: 'string' },
					],
				},
			],
			createdAt: new Date(),
			createdBy: '',
		} as const;

		const result = getDictionarySchemaRelations(dictionarySportStats);

		expect(result).to.eql({ sports: [] });
	});
});
