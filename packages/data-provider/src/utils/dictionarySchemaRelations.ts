import { Schema } from '@overture-stack/lectern-client';

import { ORDER_TYPE, type OrderType, SCHEMA_RELATION_TYPE, type SchemaRelationType } from './types.js';

export interface SchemaParentNode {
	schemaName: string;
	fieldName: string;
}
export interface SchemaChildNode {
	schemaName: string;
	fieldName: string;
	parent: SchemaParentNode;
}

/* eslint-disable @typescript-eslint/no-empty-object-type */
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
	fieldName?: string;
	children?: TreeNode[];
	parent?: TreeNode;
}

/**
 * Function to find or create a node in the tree
 * @param tree
 * @param schemaName
 * @param order
 * @returns
 */
const findOrCreateNode = (tree: TreeNode[], schemaName: string, order: OrderType): TreeNode => {
	let node = tree.find((n) => n.schemaName === schemaName);
	if (!node) {
		node = {
			schemaName,
			...(order === ORDER_TYPE.Values.desc ? { children: [] } : { parent: undefined }),
		};
		tree.push(node);
	}
	return node;
};

/**
 * Finds a matching schema name within a nested object.
 * Return true only if any matching schema name is found.
 * @param treeNode
 * @param schemaName
 * @param type
 * @returns
 */
const hasNestedNode = (treeNode: TreeNode, schemaName: string, type: SchemaRelationType): boolean => {
	if (type === SCHEMA_RELATION_TYPE.Values.parent) {
		if (!treeNode.parent) {
			return false;
		}
		return hasNestedNode(treeNode.parent, schemaName, type);
	} else {
		if (!treeNode.children) {
			return false;
		}
		return treeNode.children.some(
			(node) =>
				node.schemaName === schemaName ||
				node.children?.some((innerNode) => hasNestedNode(innerNode, schemaName, type)),
		);
	}
};

/**
 * Builds a hierarchy tree by linking the given schema to its parent schema based on foreign keys.
 * This function recursively creates or finds nodes in the `tree` and establishes parent-child relationships
 * between schemas using their foreign key mappings. It ensures that duplicate relationships are not created.
 * @param schema The current schema definition to be added to the hierarchy tree
 * @param tree The current tree of schema nodes, which gets updated with parent-child relationships as the hierarchy is built.
 * @param order Order of the structure
 * @returns
 */
const buildHierarchyTree = (schema: SchemaDefinition, tree: TreeNode[], order: OrderType) => {
	// Create a node for the current schema
	const node = findOrCreateNode(tree, schema.name, order);

	schema.restrictions?.foreignKey?.forEach((foreignKey) => {
		// Find the related schema by its name
		const relatedSchema = findOrCreateNode(tree, foreignKey.schema, order);

		// Use the first mapping for parent-child field relationship
		const mapping = foreignKey.mappings[0];

		// remove duplicates. skip mapping when schema is already linked
		if (order === ORDER_TYPE.Values.desc) {
			const cloneNode = {
				...node,
				fieldName: mapping.local,
				parentFieldName: mapping.foreign,
			};
			relatedSchema.children = (
				relatedSchema.children?.filter(
					(item) => !hasNestedNode(cloneNode, item.schemaName, SCHEMA_RELATION_TYPE.Values.children),
				) || []
			).concat(cloneNode);
		} else {
			const cloneNode = {
				...relatedSchema,
				fieldName: mapping.foreign,
				parentFieldName: mapping.local,
			};

			// Remove duplicates. Skip mapping when schema is already linked
			node.parent = !hasNestedNode(node, cloneNode.schemaName, SCHEMA_RELATION_TYPE.Values.parent)
				? cloneNode
				: node.parent;
		}
	});
};

/**
 * Function to generate the hierarchy tree of a dictionary schemas
 * Order by `asc` should return children to parent relations
 * Order by `desc` should return parent to chilren relations
 * @param source The list of all schemas.
 * @param order Order of the structed.
 * @returns The hierarchical tree structure.
 */
export const generateHierarchy = (source: SchemaDefinition[], order: OrderType): TreeNode[] => {
	const tree: TreeNode[] = [];

	source
		.sort((schemaA, schemaB) => {
			// Sorting starts with the schemas that have no foreign keys (root nodes)
			const a = schemaA.restrictions?.foreignKey ? schemaA.restrictions.foreignKey.length : 0;
			const b = schemaB.restrictions?.foreignKey ? schemaB.restrictions.foreignKey.length : 0;
			return order === ORDER_TYPE.Values.desc ? b - a : a - b;
		})
		.forEach((schema) => buildHierarchyTree(schema, tree, order));

	return tree;
};
