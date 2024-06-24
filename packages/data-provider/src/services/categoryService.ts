import * as _ from 'lodash-es';
import { BaseDependencies } from '../config/config.js';
import categoryRepository from '../repository/categoryRepository.js';
import { CategoryDetailsResponse, ListAllCategoriesResponse } from '../utils/types.js';

const categoryService = (dependencies: BaseDependencies) => {
	const LOG_MODULE = 'CATEGORY_SERVICE';
	const { logger } = dependencies;
	const categoryRepo = categoryRepository(dependencies);
	return {
		getDetails: async (categoryId: number): Promise<CategoryDetailsResponse | undefined> => {
			logger.debug(LOG_MODULE, `Get category Details`);
			const category = await categoryRepo.getCategoryById(categoryId);
			if (category) {
				return {
					id: category.id,
					dictionary: {
						name: category.activeDictionary?.name || '',
						version: category.activeDictionary?.version || '',
					},
					name: category.name,
					createdAt: _.toString(category.createdAt?.toISOString()),
					createdBy: _.toString(category.createdBy),
					updatedAt: _.toString(category.updatedAt),
					updatedBy: _.toString(category.updatedBy),
				};
			}

			return undefined;
		},
		listAll: async (): Promise<ListAllCategoriesResponse[]> => {
			logger.debug(LOG_MODULE, `List all categories`);
			return await categoryRepo.getAllCategoryNames();
		},
	};
};

export default categoryService;
