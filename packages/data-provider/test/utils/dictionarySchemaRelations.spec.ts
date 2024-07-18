import { expect } from 'chai';
import { describe, it } from 'mocha';

import { getDictionarySchemaRelations } from '../../src/utils/dictionarySchemaRelations.js';
import { sampleChildrenNodes, sampleDictionary } from './dictionarySchemasTestData.js';

describe('Test Dictionary Schema Relations', () => {
	it('should return the schema children nodes on a Dictionary', () => {
		const result = getDictionarySchemaRelations(sampleDictionary);

		expect(result).to.deep.equal(sampleChildrenNodes);
	});
});
