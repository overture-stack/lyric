import { isEmpty } from 'lodash-es';
import { Dependencies, GlobalConfig } from '../config/config.js';

import getCategoryUtils from '../utils/categoryUtils.js';
import getDictionaryUtils from '../utils/dictionaryUtils.js';

export default class DictionaryService extends GlobalConfig {
	registerDictionary = async (categoryName: string, dictionaryName: string, version: string) => {
		const { createCategoryIfDoesNotExist } = getCategoryUtils(this.dependencies);
		const savedCategory = await createCategoryIfDoesNotExist(categoryName);
		if (isEmpty(savedCategory)) return;

		const { createDictionaryIfDoesNotExist, fetchDictionaryByVersion } = getDictionaryUtils(this.dependencies);
		const dictionary = await fetchDictionaryByVersion(dictionaryName, version);
		if (isEmpty(dictionary)) return;

		const savedDictionary = await createDictionaryIfDoesNotExist(dictionaryName, version, savedCategory, dictionary);
		return savedDictionary;
	};

	getCurrentDictionary = async () => {
		// TODO
		// Read directionary from DB
		return '';
	};
}
