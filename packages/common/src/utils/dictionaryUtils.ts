import { and, eq } from 'drizzle-orm/sql';
import { isEmpty } from 'lodash-es';

import { SchemasDictionary } from '@overturebio-stack/lectern-client/lib/schema-entities.js';
import { Dependencies } from '../config/config.js';
import lecternClient from '../external/lecternClient.js';
import { Dictionary, NewDictionary, dictionaries } from '../models/dictionaries.js';
import dictionaryRepository from '../repository/dictionaryRepository.js';

const utils = (dependencies: Dependencies) => {
	const LOG_MODULE = 'DICTIONARY_UTILS';
	const { logger } = dependencies;
	return {
		createDictionaryIfDoesNotExist: async (
			dictionaryName: string,
			version: string,
			category: any,
			dictionary: SchemasDictionary,
		): Promise<Dictionary> => {
			const dictionaryRepo = dictionaryRepository(dependencies);

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
	};
};

export default utils;
