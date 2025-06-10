import plur from 'plur';

import {
	type DataRecord,
	Dictionary as SchemasDictionary,
	type Schema,
	validate,
} from '@overture-stack/lectern-client';

import type { FieldNamesByPriorityMap } from './types.js';

/**
 * Retrieves a schema definition by its name from the provided schemas dictionary.
 * @param schemaName The name of the schema to look up.
 * @param schemasDictionary The dictionary containing all available schemas.
 * @returns The matching schema if found, otherwise `undefined`
 */
export const getSchemaByName = (schemaName: string, schemasDictionary: SchemasDictionary): Schema | undefined => {
	return schemasDictionary.schemas.find((schema) => schema.name === schemaName);
};

/**
 * Get Fields from Schema
 * @param {Schema} schema Schema object
 * @returns The arrays of requied and options fields from the schema
 */
export const getSchemaFieldNames = (schema: Schema): FieldNamesByPriorityMap => {
	return schema.fields.reduce<{ required: string[]; optional: string[] }>(
		(acc, field) => {
			const requiredRestriction =
				field.restrictions && 'required' in field.restrictions ? field.restrictions.required : undefined;

			if (requiredRestriction) {
				acc.required.push(field.name);
			} else {
				acc.optional.push(field.name);
			}

			return acc;
		},
		{ required: [], optional: [] },
	);
};

export const pluralizeSchemaName = (schemaName: string) => {
	return plur(schemaName);
};

/**
 * Validate a full set of Schema Data using a Dictionary
 * @param {SchemasDictionary & {id: number }} dictionary
 * @param {Record<string, DataRecord[]>} schemasData
 * @returns  A TestResult object representing the outcome of a test applied to some data.
 * If a test is valid, no additional data is added to the result. If it is invalid, then the
 * reason (or array of reasons) for why the test failed should be given.
 */
export const validateSchemas = (
	dictionary: SchemasDictionary & {
		id: number;
	},
	schemasData: Record<string, DataRecord[]>,
) => {
	const schemasDictionary: SchemasDictionary = {
		name: dictionary.name,
		version: dictionary.version,
		schemas: dictionary.schemas,
	};

	return validate.validateDictionary(schemasData, schemasDictionary);
};

export { SchemasDictionary };
