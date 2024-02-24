import { eq } from 'drizzle-orm/sql';
import { isEmpty } from 'lodash-es';

import { Dependencies } from '../config/config.js';
import { NewCategory, dictionaryCategories } from '../models/dictionary_categories.js';
import CategoryRepository from '../repository/categoryRepository.js';

export const createCategoryIfDoesNotExist = (dependencies: Dependencies) => async (categoryName: string) => {
	try {
		const categoryRepo = new CategoryRepository(dependencies);
		const foundCategory = await categoryRepo.select({}, eq(dictionaryCategories.name, categoryName));
		console.log(`foundCategory:${JSON.stringify(foundCategory)}`);
		if (!isEmpty(foundCategory)) return foundCategory[0];

		const newCategory: NewCategory = {
			name: categoryName,
		};
		const savedCategory = await categoryRepo.save(newCategory);
		return savedCategory;
	} catch (error) {
		console.error(`Error saving Category: ${error}`);
		throw error;
	}
};

export default (dependencies: Dependencies) => {
	return {
		createCategoryIfDoesNotExist: createCategoryIfDoesNotExist(dependencies),
	};
};
