import { expect } from 'chai';
import { describe, it } from 'mocha';

import { getDictionarySchemaRelations } from '../../src/utils/dictionarySchemaRelations.js';
import { dictionarySportStats, dictionarySportStatsNodeGraph } from './fixtures/dictionarySchemasTestData.js';

describe('Test Dictionary Schema Relations', () => {
	it('should return the schema children nodes on a Dictionary', () => {
		const result = getDictionarySchemaRelations(dictionarySportStats);

		expect(result).to.deep.equal(dictionarySportStatsNodeGraph);
	});
});
