import { eq } from 'drizzle-orm/sql';
import { isEmpty } from 'lodash-es';

import { Dependencies } from '../config/config.js';
import { NewCategory, dictionaryCategories } from '../models/dictionary_categories.js';
import categoryRepository from '../repository/categoryRepository.js';

const utils = (dependencies: Dependencies) => {
	return {
		createCategoryIfDoesNotExist: async (categoryName: string) => {
			const { logger } = dependencies;
			try {
				const categoryRepo = categoryRepository(dependencies);
				const foundCategory = await categoryRepo.select({}, eq(dictionaryCategories.name, categoryName));
				if (!isEmpty(foundCategory)) {
					logger.info(`Category ${categoryName} already exists. Not doing any action`);
					return foundCategory[0];
				}

				const newCategory: NewCategory = {
					name: categoryName,
				};
				const savedCategory = await categoryRepo.save(newCategory);
				return savedCategory;
			} catch (error) {
				logger.error(`Error saving Category: ${error}`);
				throw error;
			}
		},
	};
};

export default utils;
