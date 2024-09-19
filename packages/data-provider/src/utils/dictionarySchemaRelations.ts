import { Dictionary } from '@overture-stack/lyric-data-model';

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
	return dictionary.dictionary.reduce<Record<string, SchemaChildNode[]>>((acc, schemaDefinition) => {
		// Iterate all children of current schema
		schemaDefinition.restrictions?.foreignKey?.reduce((acc, foreignKey) => {
			const parentSchemaName = foreignKey.schema;

			return foreignKey.mappings.reduce((mappingAccumulator, mapping) => {
				const childNode: SchemaChildNode = {
					schemaName: schemaDefinition.name,
					fieldName: mapping.local,
					parent: {
						schemaName: parentSchemaName,
						fieldName: mapping.foreign,
					},
				};

				mappingAccumulator[parentSchemaName] = (mappingAccumulator[parentSchemaName] || []).concat(childNode);
				return mappingAccumulator;
			}, acc);
		}, acc);

		// if schema doesn't have any children create an empty record
		if (!acc[schemaDefinition.name]) {
			acc[schemaDefinition.name] = [];
		}

		return acc;
	}, {});
};
