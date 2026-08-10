import { expect } from 'chai';
import { describe, it } from 'mocha';

import { pluralizeSchemaName } from '../../../src/utils/submissionUtils.js';

describe('Submission Utils', () => {
	describe('pluralizeSchemaName', () => {
		it('pluralizes a regular schema name', () => {
			expect(pluralizeSchemaName('donor')).to.equal('donors');
		});

		it('pluralizes a schema name ending in a consonant + y', () => {
			expect(pluralizeSchemaName('family_history')).to.equal('family_histories');
		});

		it('pluralizes a schema name ending in a Latin -is, not just appending s', () => {
			expect(pluralizeSchemaName('primary_diagnosis')).to.equal('primary_diagnoses');
		});

		it('pluralizes a schema name that a naive uncountable-noun list would leave unchanged', () => {
			expect(pluralizeSchemaName('specimen')).to.equal('specimens');
		});
	});
});
