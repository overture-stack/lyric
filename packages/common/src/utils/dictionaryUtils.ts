import { and, eq } from 'drizzle-orm/sql';
import { isEmpty } from 'lodash-es';

import { SchemasDictionary } from '@overturebio-stack/lectern-client/lib/schema-entities.js';
import { Dependencies } from '../config/config.js';
import lecternClient from '../external/lecternClient.js';
import { NewDictionary, dictionaries } from '../models/dictionaries.js';
import dictionaryRepository from '../repository/dictionaryRepository.js';

const utils = (dependencies: Dependencies) => {
	return {
		createDictionaryIfDoesNotExist: async (
			dictionaryName: string,
			version: string,
			category: any,
			dictionary: SchemasDictionary,
		) => {
			const dictionaryRepo = dictionaryRepository(dependencies);
			const { logger } = dependencies;
			try {
				const foundDictionary = await dictionaryRepo.select(
					{},
					and(eq(dictionaries.name, dictionaryName), eq(dictionaries.version, version)),
				);
				if (!isEmpty(foundDictionary)) {
					logger.info(
						`Dictionary with name:${dictionaryName} and version:${version} already exists. Not doing any action`,
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
				logger.error(`Error saving dictionary: ${error}`);
				throw error;
			}
		},

		fetchDictionaryByVersion: async (dictionaryName: string, version: string): Promise<SchemasDictionary> => {
			const { logger } = dependencies;
			try {
				const client = lecternClient(dependencies.config.schemaService.url);
				const dictionaryResponse = await client.fetchDictionaryByVersion(dictionaryName, version);
				logger.debug(`dictionary fetched from Lectern:${JSON.stringify(dictionaryResponse)}`);
				return dictionaryResponse;
			} catch (error) {
				logger.error(`Error Fetching dictionary from lectern: ${error}`);
				throw error;
			}
		},
	};
};

export default utils;
