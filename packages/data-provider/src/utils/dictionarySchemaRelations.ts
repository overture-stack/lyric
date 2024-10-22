import { Schema } from '@overture-stack/lectern-client';

export interface SchemaParentNode {
	schemaName: string;
	fieldName: string;
}
export interface SchemaChildNode {
	schemaName: string;
	fieldName: string;
	parent: SchemaParentNode;
}

interface SchemaDefinition extends Schema {}

/**
 * Returns all the children and it's relations by each schema on a Dictionary
 * @param {SchemaDefinition[]} schemaDefinition
 * @returns {Record<string, SchemaChildNode[]>}
 */
export const getDictionarySchemaRelations = (
	schemaDefinition: SchemaDefinition[],
): Record<string, SchemaChildNode[]> => {
	return schemaDefinition.reduce<Record<string, SchemaChildNode[]>>((acc, schemaDefinition) => {
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

export interface TreeNode {
	schemaName: string;
	parentFieldName?: string;
	childrenFieldName?: string;
	children?: TreeNode[];
}

/**
 * Function to find or create a node in the tree
 * @param tree
 * @param schemaName
 * @returns
 */
const findOrCreateNode = (tree: TreeNode[], schemaName: string): TreeNode => {
	let node = tree.find((n) => n.schemaName === schemaName);
	if (!node) {
		node = { schemaName, children: [] };
		tree.push(node);
	}
	return node;
};

/**
 * Builds a hierarchy tree by linking the given schema to its parent schema based on foreign keys.
 * This function recursively creates or finds nodes in the `tree` and establishes parent-child relationships
 * between schemas using their foreign key mappings. It ensures that duplicate relationships are not created.
 * @param schema The current schema definition to be added to the hierarchy tree
 * @param tree The current tree of schema nodes, which gets updated with parent-child relationships as the hierarchy is built.
 * @returns
 */
const buildHierarchyTree = (schema: SchemaDefinition, tree: TreeNode[]) => {
	// Create a node for the current schema
	const node = findOrCreateNode(tree, schema.name);

	// Check if the schema has foreign keys to build its children
	const foreignKeys = schema.restrictions?.foreignKey || [];

	// If no foreign keys are present, the function ends here as no relationships need to be built
	if (foreignKeys.length === 0) {
		return;
	}

	foreignKeys.forEach((foreignKey) => {
		// Find the child schema by its name
		const parentSchema = findOrCreateNode(tree, foreignKey.schema);
		if (parentSchema) {
			// remove duplicates. skip mapping when schema is already linked
			if (parentSchema.children?.find((child) => foreignKeys.find((fk) => fk.schema === child.schemaName))) return;

			// Use the first mapping for parent-child field relationship (you can extend to support multiple mappings)
			const mapping = foreignKey.mappings[0];

			const cloneNode = {
				...node,
				childrenFieldName: mapping.local,
				parentFieldName: mapping.foreign,
			};

			parentSchema.children?.push(cloneNode);
			return;
		}
	});
};

/**
 * Function to generate the hierarchy tree of a dictionary schemas
 * @param source The list of all schemas.
 * @returns The hierarchical tree structure.
 */
export const generateHierarchy = (source: SchemaDefinition[]): TreeNode[] => {
	const tree: TreeNode[] = [];

	source
		.sort((schemaA, schemaB) => {
			// Sorting to start with the schemas that have no foreign keys (root nodes)
			const a = schemaA.restrictions?.foreignKey ? schemaA.restrictions.foreignKey.length : 0;
			const b = schemaB.restrictions?.foreignKey ? schemaB.restrictions.foreignKey.length : 0;
			return a - b;
		})
		.forEach((schema) => buildHierarchyTree(schema, tree));

	return tree;
};
