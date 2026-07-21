/**
 * Fixtures and types for dictionary migration tests.
 * These are shared between multiple test files related to dictionary registration and migration.
 */

export type RegisterPayload = {
	categoryName?: string;
	dictionaryName?: string;
	dictionaryVersion?: string;
	defaultCentricEntity?: string;
};

export const NEW_DICTIONARY_VERSION = '2.0';
export const ORGANIZATION = 'test-org';
export const VALID_CATEGORY_NAME = 'test-category';
export const VALID_DICTIONARY_NAME = 'valid-dictionary';
export const VALID_DICTIONARY_VERSION = '1.0';
