import { Dependencies } from '../config/config.js';

import { Dictionary } from '../models/dictionaries.js';
import getCategoryUtils from '../utils/categoryUtils.js';
import getDictionaryUtils from '../utils/dictionaryUtils.js';
import { NotImplemented } from '../utils/errors.js';

const dictionaryService = (dependencies: Dependencies) => {
	const LOG_MODULE = 'DICTIONARY_SERVICE';
	const { logger } = dependencies;
	return {
		register: async (categoryName: string, dictionaryName: string, version: string): Promise<Dictionary> => {
			logger.debug(
				LOG_MODULE,
				`Register new dictionary categoryName '${categoryName}' dictionaryName '${dictionaryName}' version '${version}'`,
			);
			const { createCategoryIfDoesNotExist, saveAsCurrentDictionaryOnCategory } = getCategoryUtils(dependencies);
			const savedCategory = await createCategoryIfDoesNotExist(categoryName);
			logger.debug(`savedCategory:${JSON.stringify(savedCategory)}`);

			const { createDictionaryIfDoesNotExist, fetchDictionaryByVersion } = getDictionaryUtils(dependencies);
			const dictionary = await fetchDictionaryByVersion(dictionaryName, version);

			const savedDictionary = await createDictionaryIfDoesNotExist(
				dictionaryName,
				version,
				savedCategory,
				dictionary.schemas,
			);

			await saveAsCurrentDictionaryOnCategory(savedDictionary.id, savedCategory.id);

			return savedDictionary;
		},

		getCurrentDictionary: async () => {
			// TODO: Read latest dictionary from DB
			throw new NotImplemented('This functionallity is not implemented');
		},
	};
};

export default dictionaryService;
