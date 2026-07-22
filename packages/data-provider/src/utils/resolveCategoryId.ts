import { BaseDependencies } from '../config/config.js';
import categoryRepository from '../repository/categoryRepository.js';

/**
 * Resolves a categoryId path param (numeric id or alias) to the category's numeric id; alias
 * wins on a collision (see `getCategoryByIdOrAlias`). Returns undefined if neither matches.
 */
export const resolveCategoryId = async (
	dependencies: BaseDependencies,
	categoryIdOrAlias: string,
): Promise<number | undefined> => {
	const category = await categoryRepository(dependencies).getCategoryByIdOrAlias(categoryIdOrAlias);
	return category?.id;
};
