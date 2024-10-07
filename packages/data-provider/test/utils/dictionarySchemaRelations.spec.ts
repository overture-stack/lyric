import { expect } from 'chai';
import { describe, it } from 'mocha';

import { Schema } from '@overture-stack/lectern-client';

interface SchemaDefinition extends Schema {}

import { getDictionarySchemaRelations } from '../../src/utils/dictionarySchemaRelations.js';
import { dictionarySportStats, dictionarySportStatsNodeGraph } from './fixtures/dictionarySchemasTestData.js';

describe('Dictionary Schema Relations', () => {
	it('should return the schema children nodes on a Dictionary', () => {
		const result = getDictionarySchemaRelations(dictionarySportStats.dictionary);

		expect(result).to.deep.equal(dictionarySportStatsNodeGraph);
	});
	it('should return an empty schema children for a schema with no children', () => {
		const dictionarySchemas: SchemaDefinition[] = [
			{
				name: 'sports',
				fields: [
					{ name: 'sport_id', valueType: 'integer' },
					{ name: 'name', valueType: 'string' },
				],
			},
		];

		const result = getDictionarySchemaRelations(dictionarySchemas);

		expect(result).to.eql({ sports: [] });
	});
});
