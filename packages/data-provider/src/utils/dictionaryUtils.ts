import { Dictionary as SchemasDictionary, type Schema } from '@overture-stack/lectern-client';

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

export { SchemasDictionary };
