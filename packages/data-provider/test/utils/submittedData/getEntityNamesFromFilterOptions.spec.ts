import { expect } from 'chai';
import { describe, it } from 'mocha';

import { getEntityNamesFromFilterOptions } from '../../../src/utils/submittedDataUtils.js';
import { VIEW_TYPE } from '../../../src/utils/types.js';

describe('Submitted Data Utils - getEntityNamesFromFilterOptions', () => {
	describe('Determine the entity names based on the provided filter', () => {
		it('should return an array with defaultCentricEntity if view is compound', () => {
			const filterOptions = { view: VIEW_TYPE.Values.compound, entityName: ['entity1', 'entity2'] };
			const result = getEntityNamesFromFilterOptions(filterOptions, 'defaultEntity');
			expect(result).to.eql(['defaultEntity']);
		});

		it('should return entityName array if view is not compound and entityName is provided', () => {
			const filterOptions = { view: VIEW_TYPE.Values.flat, entityName: ['entity1', 'entity2'] };
			const result = getEntityNamesFromFilterOptions(filterOptions, undefined);
			expect(result).to.eql(['entity1', 'entity2']);
		});

		it('should return an empty array if neither defaultCentricEntity nor entityName are provided', () => {
			const filterOptions = { view: VIEW_TYPE.Values.flat, entityName: [] };
			const result = getEntityNamesFromFilterOptions(filterOptions, undefined);
			expect(result).to.eql([]);
		});

		it('should return an empty array if entityName is undefined and view is not compound', () => {
			const filterOptions = { view: VIEW_TYPE.Values.flat };
			const result = getEntityNamesFromFilterOptions(filterOptions, undefined);
			expect(result).to.eql([]);
		});
	});
});
