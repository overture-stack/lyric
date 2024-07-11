import * as _ from 'lodash-es';

import { BaseDependencies } from '../config/config.js';
import categoryRepository from '../repository/categoryRepository.js';
import submittedDataRepository from '../repository/submittedRepository.js';
import { CategoryDetailsResponse, ListAllCategoriesResponse } from '../utils/types.js';

const categoryService = (dependencies: BaseDependencies) => {
	const LOG_MODULE = 'CATEGORY_SERVICE';
	const { logger } = dependencies;
	const categoryRepo = categoryRepository(dependencies);
	const submittedDataRepo = submittedDataRepository(dependencies);
	return {
		getDetails: async (categoryId: number): Promise<CategoryDetailsResponse | undefined> => {
			logger.debug(LOG_MODULE, `Get category Details`);
			const category = await categoryRepo.getCategoryById(categoryId);
			if (category) {
				const organizationsFound = await submittedDataRepo.getAllOrganizationsByCategoryId(categoryId);

				return {
					id: category.id,
					dictionary: category.activeDictionary
						? {
								name: category.activeDictionary.name,
								version: category.activeDictionary.version,
							}
						: undefined,
					name: category.name,
					organizations: organizationsFound,
					createdAt: _.toString(category.createdAt?.toISOString()),
					createdBy: _.toString(category.createdBy),
					updatedAt: _.toString(category.updatedAt?.toISOString()),
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
