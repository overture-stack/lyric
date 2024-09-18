import { Dictionary as SchemasDictionary, type Schema } from '@overture-stack/lectern-client';

import type { FieldNamesByPriorityMap } from './types.js';

/**
 * Get Fields from Schema
 * @param {SchemasDictionary} dictionary Dictionary object
 * @param {string} entityType Name of the Entity
 * @returns The arrays of requied and options fields from the schema
 */
export const getSchemaFieldNames = (dictionary: SchemasDictionary, entityType: string): FieldNamesByPriorityMap => {
	const schemaDef: Schema | undefined = dictionary.schemas.find((schema) => schema.name === entityType);
	if (!schemaDef) {
		throw new Error(`no schema found for : ${entityType}`);
	}
	const fieldNamesMapped: FieldNamesByPriorityMap = { required: [], optional: [] };
	schemaDef.fields.forEach((field) => {
		const requiredRestriction =
			field.restrictions && 'required' in field.restrictions ? field.restrictions.required : undefined;

		if (requiredRestriction) {
			fieldNamesMapped.required.push(field.name);
		} else {
			fieldNamesMapped.optional.push(field.name);
		}
	});
	return fieldNamesMapped;
};
