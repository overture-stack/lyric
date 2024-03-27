import { isEmpty } from 'lodash-es';

import { Dependencies } from '../config/config.js';
import { Category, NewCategory } from '../models/dictionary_categories.js';
import categoryRepository from '../repository/categoryRepository.js';

const utils = (dependencies: Dependencies) => {
	const LOG_MODULE = 'CATEGORY_UTILS';
	const { logger } = dependencies;
	const categoryRepo = categoryRepository(dependencies);
	return {
		/**
		 * Saves a new category if it doesn't exist or returns the existing one
		 * @param categoryName The name of the category to create
		 * @returns A category created or the existing one
		 */
		createCategoryIfDoesNotExist: async (categoryName: string): Promise<Category> => {
			try {
				const foundCategory = await categoryRepo.getCategoryByName(categoryName);
				if (!isEmpty(foundCategory)) {
					logger.info(LOG_MODULE, `Category '${categoryName}' already exists`);
					return foundCategory;
				}

				const newCategory: NewCategory = {
					name: categoryName,
				};
				const savedCategory = await categoryRepo.save(newCategory);
				return savedCategory;
			} catch (error) {
				logger.error(LOG_MODULE, `Error saving Category`, error);
				throw error;
			}
		},
		/**
		 * Save dictionary as Current for this category
		 */
		saveAsCurrentDictionaryOnCategory: async (dictionaryId: number, categoryId: number) => {
			const updateResult = await categoryRepo.updateCurrentDictionaryOnCategory(dictionaryId, categoryId);
			return updateResult;
		},
	};
};

export default utils;
