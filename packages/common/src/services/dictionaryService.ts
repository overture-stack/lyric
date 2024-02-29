import { isEmpty } from 'lodash-es';
import { Dependencies } from '../config/config.js';

import getCategoryUtils from '../utils/categoryUtils.js';
import getDictionaryUtils from '../utils/dictionaryUtils.js';

const service = (dependencies: Dependencies) => {
	return {
		registerDictionary: async (categoryName: string, dictionaryName: string, version: string) => {
			const { createCategoryIfDoesNotExist } = getCategoryUtils(dependencies);
			const savedCategory = await createCategoryIfDoesNotExist(categoryName);
			if (isEmpty(savedCategory)) return;

			const { createDictionaryIfDoesNotExist, fetchDictionaryByVersion } = getDictionaryUtils(dependencies);
			const dictionary = await fetchDictionaryByVersion(dictionaryName, version);
			if (isEmpty(dictionary)) return;

			const savedDictionary = await createDictionaryIfDoesNotExist(dictionaryName, version, savedCategory, dictionary);
			return savedDictionary;
		},

		getCurrentDictionary: async () => {
			// TODO
			// Read directionary from DB
			return '';
		},
	};
};

export default service;
