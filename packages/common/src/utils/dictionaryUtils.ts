import { and, eq } from 'drizzle-orm/sql';
import { isEmpty } from 'lodash-es';

import { SchemasDictionary } from '@overturebio-stack/lectern-client/lib/schema-entities.js';
import { Dependencies } from '../config/config.js';
import { LecternClient } from '../external/lecternClient.js';
import { NewDictionary, dictionaries } from '../models/dictionaries.js';
import DictionaryRepository from '../repository/dictionaryRepository.js';

const createDictionaryIfDoesNotExist =
	(dependencies: Dependencies) =>
	async (dictionaryName: string, version: string, category: any, dictionary: SchemasDictionary) => {
		const dictionaryRepo = new DictionaryRepository(dependencies);
		try {
			const foundDictionary = await dictionaryRepo.select(
				{},
				and(eq(dictionaries.name, dictionaryName), eq(dictionaries.version, version)),
			);
			console.log(`foundDictionary:${JSON.stringify(foundDictionary)}`);
			if (!isEmpty(foundDictionary)) return foundDictionary[0];

			const newDictionary: NewDictionary = {
				name: dictionaryName,
				version: version,
				dictionaryCategoryId: category?.id,
				dictionary: dictionary.schemas,
			};
			const savedDictionary = await dictionaryRepo.save(newDictionary);
			return savedDictionary;
		} catch (error) {
			console.error(`Error saving dictionary: ${error}`);
			throw error;
		}
	};

const fetchDictionaryByVersion =
	(dependencies: Dependencies) =>
	async (dictionaryName: string, version: string): Promise<SchemasDictionary> => {
		try {
			const lecternClient = new LecternClient(dependencies.config.schemaService.url);
			const dictionaryResponse = await lecternClient.fetchDictionaryByVersion(dictionaryName, version);
			console.log(`dictionary fetched:${JSON.stringify(dictionaryResponse)}`);
			return dictionaryResponse;
		} catch (error) {
			console.error(`Error Fetching dictionary from lectern: ${error}`);
			throw error;
		}
	};

export default (dependencies: Dependencies) => {
	return {
		createDictionaryIfDoesNotExist: createDictionaryIfDoesNotExist(dependencies),
		fetchDictionaryByVersion: fetchDictionaryByVersion(dependencies),
	};
};
