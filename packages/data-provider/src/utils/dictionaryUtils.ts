import dictionaryEntities from '@overturebio-stack/lectern-client/lib/schema-entities.js';
import dictionaryFunctions from '@overturebio-stack/lectern-client/lib/schema-functions.js';

/**
 * Get Fields from Schema
 * @param {SchemasDictionary} dictionary Dictionary object
 * @param {string} entityType Name of the Entity
 * @returns The arrays of requied and options fields from the schema
 */
export const getSchemaFieldNames = async (
	dictionary: dictionaryEntities.SchemasDictionary,
	entityType: string,
): Promise<dictionaryEntities.FieldNamesByPriorityMap> => {
	return dictionaryFunctions.getSchemaFieldNamesWithPriority(dictionary, entityType);
};
