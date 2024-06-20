import * as _ from 'lodash-es';

import { SchemaDefinition } from '@overturebio-stack/lectern-client/lib/schema-entities.js';
import { Dictionary } from 'data-model';

export interface SchemaNode {
	schemaName: string;
	fieldName: string;
	parent?: SchemaNode;
}

/**
 * Returns all the children and it's relations by each schema on a Dictionary
 * @param {Dictionary} dictionary
 * @returns {Record<string, SchemaNode[]>}
 */
export const getDictionarySchemaRelations = (dictionary: Dictionary): Record<string, SchemaNode[]> => {
	const dictionaryRelations: Record<string, SchemaNode[]> = {};

	dictionary.dictionary.map((schemaDefinition: SchemaDefinition) => {
		const childrenSchemaName = schemaDefinition.name;

		schemaDefinition.restrictions?.foreignKey?.map((foreignKey) => {
			const parentSchemaName = foreignKey.schema;

			foreignKey.mappings.map((mapping) => {
				const childrenNode: SchemaNode = {
					schemaName: childrenSchemaName,
					fieldName: mapping.local,
					parent: {
						schemaName: parentSchemaName,
						fieldName: mapping.foreign,
					},
				};

				dictionaryRelations[parentSchemaName] = dictionaryRelations[parentSchemaName] || [];
				dictionaryRelations[parentSchemaName].push(childrenNode);
			});
		});
	});

	return dictionaryRelations;
};
