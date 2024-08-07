import { isEmpty } from 'lodash-es';

import { Dictionary, NewDictionary } from '@overture-stack/lyric-data-model';
import { entities as dictionaryEntities, functions as dictionaryFunctions } from '@overturebio-stack/lectern-client';
import { SchemaDefinition, SchemasDictionary } from '@overturebio-stack/lectern-client/lib/schema-entities.js';

import { BaseDependencies } from '../config/config.js';
import lecternClient from '../external/lecternClient.js';
import dictionaryRepository from '../repository/dictionaryRepository.js';

const utils = (dependencies: BaseDependencies) => {
	const LOG_MODULE = 'DICTIONARY_UTILS';
	const { logger } = dependencies;
	const dictionaryRepo = dictionaryRepository(dependencies);
	return {
		/**
		 * Creates a new dictionary only if it doesn't exist or returns if it already exists
		 * @param dictionaryName The name of the dictionary to create
		 * @param version The version of the dictionary to create
		 * @param schemas The Schema of the dictionary
		 * @returns The new dictionary created or the existing one
		 */
		createDictionaryIfDoesNotExist: async (
			dictionaryName: string,
			version: string,
			schemas: SchemaDefinition[],
		): Promise<Dictionary> => {
			try {
				const foundDictionary = await dictionaryRepo.getDictionary(dictionaryName, version);
				if (!isEmpty(foundDictionary)) {
					logger.info(LOG_MODULE, `Dictionary with name '${dictionaryName}' and version '${version}' already exists`);
					return foundDictionary;
				}

				const newDictionary: NewDictionary = {
					name: dictionaryName,
					version: version,
					dictionary: schemas,
				};
				const savedDictionary = await dictionaryRepo.save(newDictionary);
				return savedDictionary;
			} catch (error) {
				logger.error(LOG_MODULE, `Error saving dictionary`, error);
				throw error;
			}
		},

		/**
		 * Fetch the dictionary from Schema Service(Lectern)
		 * @param dictionaryName The dictionary name we want to fetch
		 * @param version The version of the dictionary we want to fetch
		 * @returns {SchemaDictionary} The found Dictionary
		 */
		fetchDictionaryByVersion: async (dictionaryName: string, version: string): Promise<SchemasDictionary> => {
			try {
				if (!dependencies?.schemaService?.url) {
					throw new Error(`'schemaService' is not configured`);
				}

				const client = lecternClient(dependencies.schemaService.url, logger);
				const dictionaryResponse = await client.fetchDictionaryByVersion(dictionaryName, version);
				logger.debug(LOG_MODULE, `dictionary fetched from Lectern`, JSON.stringify(dictionaryResponse));
				return dictionaryResponse;
			} catch (error) {
				logger.error(LOG_MODULE, `Error Fetching dictionary from lectern`, error);
				throw error;
			}
		},

		/**
		 * Get Fields from Schema
		 * @param {SchemasDictionary} dictionary Dictionary object
		 * @param {string} entityType Name of the Entity
		 * @returns The arrays of requied and options fields from the schema
		 */
		getSchemaFieldNames: async (
			dictionary: dictionaryEntities.SchemasDictionary,
			entityType: string,
		): Promise<dictionaryEntities.FieldNamesByPriorityMap> => {
			return dictionaryFunctions.getSchemaFieldNamesWithPriority(dictionary, entityType);
		},
	};
};

export default utils;
