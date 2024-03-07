import { and, eq } from 'drizzle-orm/sql';
import { isEmpty } from 'lodash-es';

import { SchemasDictionary } from '@overturebio-stack/lectern-client/lib/schema-entities.js';
import { Dependencies } from '../config/config.js';
import lecternClient from '../external/lecternClient.js';
import { Dictionary, NewDictionary, dictionaries } from '../models/dictionaries.js';
import { dictionaryCategories } from '../models/dictionary_categories.js';
import categoryRepository from '../repository/categoryRepository.js';
import dictionaryRepository from '../repository/dictionaryRepository.js';

const utils = (dependencies: Dependencies) => {
	const LOG_MODULE = 'DICTIONARY_UTILS';
	const { logger } = dependencies;
	const dictionaryRepo = dictionaryRepository(dependencies);
	return {
		/**
		 * Creates a new dictionary only if it doesn't exist or returns if it already exists
		 * @param dictionaryName The name of the dictionary to create
		 * @param version The version of the dictionary to create
		 * @param category The category object to which this dictionary belongs
		 * @param dictionary The Schema of the dictionary
		 * @returns The new dictionary created or the existing one
		 */
		createDictionaryIfDoesNotExist: async (
			dictionaryName: string,
			version: string,
			category: any,
			dictionary: SchemasDictionary,
		): Promise<Dictionary> => {
			try {
				const foundDictionary = await dictionaryRepo.select(
					{},
					and(eq(dictionaries.name, dictionaryName), eq(dictionaries.version, version)),
				);
				if (!isEmpty(foundDictionary)) {
					logger.info(
						LOG_MODULE,
						`Dictionary with name '${dictionaryName}' and version '${version}' already exists. Not doing any action`,
					);
					return foundDictionary[0];
				}

				const newDictionary: NewDictionary = {
					name: dictionaryName,
					version: version,
					dictionaryCategoryId: category?.id,
					dictionary: dictionary.schemas,
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
				const client = lecternClient(dependencies.config.schemaService.url, logger);
				const dictionaryResponse = await client.fetchDictionaryByVersion(dictionaryName, version);
				logger.debug(LOG_MODULE, `dictionary fetched from Lectern`, JSON.stringify(dictionaryResponse));
				return dictionaryResponse;
			} catch (error) {
				logger.error(LOG_MODULE, `Error Fetching dictionary from lectern`, error);
				throw error;
			}
		},

		/**
		 * Get the current Dictionary from database
		 * @param {number} categoryId The Category ID
		 * @returns A Dictionary instance
		 */
		getCurrentDictionary: async (categoryId: number): Promise<Dictionary> => {
			try {
				const categoryRepo = categoryRepository(dependencies);

				const dictionaryFound = await categoryRepo.findFirst(eq(dictionaryCategories.id, categoryId), {
					dictionary: true,
				});
				logger.info(
					LOG_MODULE,
					`Getting Current Dictionary name '${dictionaryFound?.dictionary?.name}' version '${dictionaryFound?.dictionary?.version}'`,
				);

				if (isEmpty(dictionaryFound)) {
					throw new Error(`Dictionary in category '${categoryId}' not found`);
				}
				return dictionaryFound.dictionary;
			} catch (error) {
				logger.error(LOG_MODULE, `Error getting current dictionary`, error);
				throw error;
			}
		},
	};
};

export default utils;
