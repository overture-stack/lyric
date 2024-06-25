import { Dictionary } from '@overture-stack/lyric-data-model';
import { SchemaDefinition } from '@overturebio-stack/lectern-client/lib/schema-entities.js';

export interface SchemaParentNode {
	schemaName: string;
	fieldName: string;
}
export interface SchemaChildNode {
	schemaName: string;
	fieldName: string;
	parent: SchemaParentNode;
}

/**
 * Returns all the children and it's relations by each schema on a Dictionary
 * @param {Dictionary} dictionary
 * @returns {Record<string, SchemaChildNode[]>}
 */
export const getDictionarySchemaRelations = (dictionary: Dictionary): Record<string, SchemaChildNode[]> => {
	const dictionaryRelations = dictionary.dictionary.reduce(
		(acc: Record<string, SchemaChildNode[]>, schemaDefinition: SchemaDefinition) => {
			schemaDefinition.restrictions?.foreignKey?.forEach((foreignKey) => {
				const parentSchemaName = foreignKey.schema;

				foreignKey.mappings.forEach((mapping) => {
					const childNode: SchemaChildNode = {
						schemaName: schemaDefinition.name,
						fieldName: mapping.local,
						parent: {
							schemaName: parentSchemaName,
							fieldName: mapping.foreign,
						},
					};

					acc[parentSchemaName] = (acc[parentSchemaName] || []).concat(childNode);
				});
			});

			return acc;
		},
		{},
	);

	return dictionaryRelations;
};
