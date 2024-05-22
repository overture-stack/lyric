import { Dictionary } from 'data-model';
import { BaseDependencies } from '../config/config.js';
import categoryRepository from '../repository/categoryRepository.js';
import getCategoryUtils from '../utils/categoryUtils.js';
import getDictionaryUtils from '../utils/dictionaryUtils.js';
import { NotImplemented } from '../utils/errors.js';

const dictionaryService = (dependencies: BaseDependencies) => {
	const LOG_MODULE = 'DICTIONARY_SERVICE';
	const { logger } = dependencies;
	return {
		register: async (categoryName: string, dictionaryName: string, version: string): Promise<Dictionary> => {
			logger.debug(
				LOG_MODULE,
				`Register new dictionary categoryName '${categoryName}' dictionaryName '${dictionaryName}' version '${version}'`,
			);
			const { createCategoryIfDoesNotExist } = getCategoryUtils(dependencies);
			const categoryRepo = categoryRepository(dependencies);

			const savedCategory = await createCategoryIfDoesNotExist(categoryName);

			const { createDictionaryIfDoesNotExist, fetchDictionaryByVersion } = getDictionaryUtils(dependencies);
			const dictionary = await fetchDictionaryByVersion(dictionaryName, version);

			const savedDictionary = await createDictionaryIfDoesNotExist(
				dictionaryName,
				version,
				savedCategory,
				dictionary.schemas,
			);

			await categoryRepo.updateCurrentDictionaryOnCategory(savedDictionary.id, savedCategory.id);

			return savedDictionary;
		},

		getCurrentDictionary: async () => {
			// TODO: Read latest dictionary from DB
			throw new NotImplemented('This functionallity is not implemented');
		},
	};
};

export default dictionaryService;
