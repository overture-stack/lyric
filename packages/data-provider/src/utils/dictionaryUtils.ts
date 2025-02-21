import { Dictionary as SchemasDictionary, type Schema } from '@overture-stack/lectern-client';

import type { FieldNamesByPriorityMap } from './types.js';

/**
 * Retrieves the display name of every field in a schema, if display name is not present, it uses the field name
 * @param {SchemasDictionary} dictionary Dictionary object
 * @param {string} entityType Name of the Entity
 * @returns An object containing the arrays of required and optional fields in the schema
 */
export const getSchemaFieldDisplayNames = (
	dictionary: SchemasDictionary,
	entityType: string,
): FieldNamesByPriorityMap => {
	const schemaDef: Schema | undefined = dictionary.schemas.find((schema) => schema.name === entityType);
	if (!schemaDef) {
		throw new Error(`no schema found for : ${entityType}`);
	}
	const fieldNamesMapped: FieldNamesByPriorityMap = { required: [], optional: [] };
	schemaDef.fields.forEach((field) => {
		const requiredRestriction =
			field.restrictions && 'required' in field.restrictions ? field.restrictions.required : undefined;

		if (requiredRestriction) {
			fieldNamesMapped.required.push(field.meta?.displayName.toString() || field.name);
		} else {
			fieldNamesMapped.optional.push(field.meta?.displayName.toString() || field.name);
		}
	});
	return fieldNamesMapped;
};
