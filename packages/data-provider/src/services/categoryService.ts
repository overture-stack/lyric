import * as _ from 'lodash-es';

import { BaseDependencies } from '../config/config.js';
import categoryRepository from '../repository/categoryRepository.js';
import submittedDataRepository from '../repository/submittedRepository.js';
import { CategoryDetailsResponse, CategorySummary } from '../utils/types.js';

const toCategorySummary = (category: { id: number; name: string; alias: string | null }): CategorySummary => ({
	id: category.id,
	name: category.name,
	alias: category.alias ?? undefined,
});

const categoryService = (dependencies: BaseDependencies) => {
	const LOG_MODULE = 'CATEGORY_SERVICE';
	const { logger } = dependencies;
	const categoryRepo = categoryRepository(dependencies);
	const submittedDataRepo = submittedDataRepository(dependencies);
	return {
		getDetails: async (categoryIdOrAlias: string): Promise<CategoryDetailsResponse | undefined> => {
			logger.debug(LOG_MODULE, `Get category Details`);
			const category = await categoryRepo.getCategoryByIdOrAlias(categoryIdOrAlias);
			if (category) {
				const organizationsFound = await submittedDataRepo.getAllOrganizationsByCategoryId(category.id);

				return {
					alias: category.alias ?? undefined,
					createdAt: _.toString(category.createdAt?.toISOString()),
					createdBy: _.toString(category.createdBy),
					dictionary: category.activeDictionary
						? {
								name: category.activeDictionary.name,
								version: category.activeDictionary.version,
							}
						: undefined,
					id: category.id,
					name: category.name,
					organizations: organizationsFound,
					updatedAt: _.toString(category.updatedAt?.toISOString()),
					updatedBy: _.toString(category.updatedBy),
				};
			}

			return undefined;
		},
		listAll: async (): Promise<CategorySummary[]> => {
			logger.debug(LOG_MODULE, `List all categories`);
			const categories = await categoryRepo.getAllCategoryNames();
			return categories.map(toCategorySummary);
		},
	};
};

export default categoryService;
