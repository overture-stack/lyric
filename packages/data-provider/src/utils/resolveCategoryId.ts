import { BaseDependencies } from '../config/config.js';
import categoryRepository from '../repository/categoryRepository.js';

/**
 * Resolves a categoryId path param (numeric id or alias) to the category's numeric id; numeric id
 * wins on a collision (see `getCategoryByIdOrAlias`). Returns undefined if neither matches.
 * @throws {ServiceUnavailable} on a database query failure; callers should not treat `undefined`
 * as the only failure mode.
 */
export const resolveCategoryId = async (
	dependencies: BaseDependencies,
	categoryIdOrAlias: string,
): Promise<number | undefined> => {
	const category = await categoryRepository(dependencies).getCategoryByIdOrAlias(categoryIdOrAlias);
	return category?.id;
};
