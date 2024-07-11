import { Category, Dictionary, NewCategory } from '@overture-stack/lyric-data-model';

import { BaseDependencies } from '../config/config.js';
import categoryRepository from '../repository/categoryRepository.js';
import getDictionaryUtils from '../utils/dictionaryUtils.js';

const dictionaryService = (dependencies: BaseDependencies) => {
	const LOG_MODULE = 'DICTIONARY_SERVICE';
	const { logger } = dependencies;
	return {
		register: async (
			categoryName: string,
			dictionaryName: string,
			version: string,
		): Promise<{ dictionary: Dictionary; category: Category }> => {
			logger.debug(
				LOG_MODULE,
				`Register new dictionary categoryName '${categoryName}' dictionaryName '${dictionaryName}' version '${version}'`,
			);

			const categoryRepo = categoryRepository(dependencies);
			const { createDictionaryIfDoesNotExist, fetchDictionaryByVersion } = getDictionaryUtils(dependencies);

			const dictionary = await fetchDictionaryByVersion(dictionaryName, version);

			const savedDictionary = await createDictionaryIfDoesNotExist(dictionaryName, version, dictionary.schemas);

			// Check if Category exist
			const foundCategory = await categoryRepo.getCategoryByName(categoryName);

			if (foundCategory && foundCategory.activeDictionaryId === savedDictionary.id) {
				// Dictionary and Category already exists
				logger.info(LOG_MODULE, `Dictionary and Category already exists`);

				return { dictionary: savedDictionary, category: foundCategory };
			} else if (foundCategory && foundCategory.activeDictionaryId !== savedDictionary.id) {
				// Update the dictionary on existing Category
				const updatedCategory = await categoryRepo.update(foundCategory.id, { activeDictionaryId: savedDictionary.id });

				logger.info(
					LOG_MODULE,
					`Category '${updatedCategory.name}' updated succesfully with Dictionary '${savedDictionary.name}' version '${savedDictionary.version}'`,
				);

				return { dictionary: savedDictionary, category: updatedCategory };
			} else {
				// Create a new Category
				const newCategory: NewCategory = {
					name: categoryName,
					activeDictionaryId: savedDictionary.id,
				};

				const savedCategory = await categoryRepo.save(newCategory);

				return { dictionary: savedDictionary, category: savedCategory };
			}
		},
	};
};

export default dictionaryService;
