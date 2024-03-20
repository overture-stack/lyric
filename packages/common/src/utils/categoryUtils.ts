import { eq } from 'drizzle-orm/sql';
import { isEmpty } from 'lodash-es';

import { Dependencies } from '../config/config.js';
import { Category, NewCategory, dictionaryCategories } from '../models/dictionary_categories.js';
import categoryRepository from '../repository/categoryRepository.js';
import { BadRequest } from './errors.js';

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
				const foundCategory = await categoryRepo.select({}, eq(dictionaryCategories.name, categoryName));
				if (!isEmpty(foundCategory)) {
					logger.info(LOG_MODULE, `Category '${categoryName}' already exists. Not doing any action`);
					return foundCategory[0];
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
		 * Finds a Category instance based on its unique ID
		 * @param {number} categoryId The ID of the Category
		 * @returns A Category instance
		 */
		getCategoryById: async (categoryId: number): Promise<Category> => {
			const categoryFound = await categoryRepo.select({}, eq(dictionaryCategories.id, categoryId));

			if (isEmpty(categoryFound) || categoryFound.length == 0) {
				logger.error(LOG_MODULE, `Category '${categoryId}' not found`);
				throw new BadRequest('Invalid Category');
			}

			return categoryFound[0];
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
