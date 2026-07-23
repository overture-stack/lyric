import * as _ from 'lodash-es';

import { BaseDependencies } from '../config/config.js';
import categoryRepository from '../repository/categoryRepository.js';
import submittedDataRepository from '../repository/submittedRepository.js';
import { BadRequest, NotFound, StatusConflict } from '../utils/errors.js';
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
		/**
		 * Sets a category's alias, only if it doesn't already have a different one. Idempotent:
		 * requesting the alias it already has succeeds as a no-op, not a conflict. Changing an
		 * existing alias to a new value isn't supported yet, see `.dev/roadmap.md`.
		 */
		assignAlias: async (categoryIdOrAlias: string, alias: string, username?: string): Promise<CategorySummary> => {
			const category = await categoryRepo.getCategoryByIdOrAlias(categoryIdOrAlias);
			if (!category) {
				throw new NotFound(`Category '${categoryIdOrAlias}' not found`);
			}

			if (category.alias === alias) {
				logger.info(LOG_MODULE, `Category alias unchanged`, { categoryId: category.id, alias, username });
				return toCategorySummary(category);
			}

			if (category.alias) {
				throw new BadRequest(
					`Category '${category.name}' already has a different alias; changing an existing alias is not yet supported`,
				);
			}

			const existingAliasOwner = await categoryRepo.getCategoryByAlias(alias);
			if (existingAliasOwner) {
				throw new StatusConflict(`Category alias '${alias}' is already in use`);
			}

			const updated = await categoryRepo.update(category.id, { alias });
			logger.info(LOG_MODULE, `Category alias assigned`, {
				categoryId: updated.id,
				newAlias: alias,
				previousAlias: null,
				username,
			});

			return toCategorySummary(updated);
		},
		/**
		 * Clears a category's alias. Idempotent: a category with no alias already succeeds as a
		 * no-op, matching standard DELETE semantics.
		 */
		unassignAlias: async (categoryIdOrAlias: string, username?: string): Promise<CategorySummary> => {
			const category = await categoryRepo.getCategoryByIdOrAlias(categoryIdOrAlias);
			if (!category) {
				throw new NotFound(`Category '${categoryIdOrAlias}' not found`);
			}

			if (!category.alias) {
				return toCategorySummary(category);
			}

			const updated = await categoryRepo.update(category.id, { alias: null });
			logger.info(LOG_MODULE, `Category alias unassigned`, {
				categoryId: updated.id,
				previousAlias: category.alias,
				username,
			});

			return toCategorySummary(updated);
		},
	};
};

export default categoryService;
