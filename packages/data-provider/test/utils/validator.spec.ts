import { expect } from 'chai';

import type { ValidatorConfig } from '../../src/config/config.js';
import { findValidatorEntry } from '../../src/utils/validator.js';

describe('findValidatorEntry', () => {
	const mockConfig: ValidatorConfig = [
		{
			categoryId: 1,
			entityName: 'Item',
			fieldName: 'itemId',
		},
		{
			categoryId: 2,
			entityName: 'Brand',
			fieldName: 'brandId',
		},
	];

	it('should return the matching config when categoryId and entityName match', () => {
		const result = findValidatorEntry({
			validatorConfig: mockConfig,
			categoryId: '1',
			entityName: 'Item',
		});

		expect(result).to.eql({
			categoryId: 1,
			entityName: 'Item',
			fieldName: 'itemId',
		});
	});

	it('should return undefined when categoryId does not match', () => {
		const result = findValidatorEntry({
			validatorConfig: mockConfig,
			categoryId: '999',
			entityName: 'Item',
		});

		expect(result).to.eql(undefined);
	});

	it('should return undefined when entityName does not match', () => {
		const result = findValidatorEntry({
			validatorConfig: mockConfig,
			categoryId: '1',
			entityName: 'UnknownEntity',
		});

		expect(result).to.eql(undefined);
	});

	it('should return undefined when config list is empty', () => {
		const result = findValidatorEntry({
			validatorConfig: [],
			categoryId: '1',
			entityName: 'Item',
		});

		expect(result).to.eql(undefined);
	});
});
