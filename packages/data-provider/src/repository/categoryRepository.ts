import { eq } from 'drizzle-orm/sql';

import { Dictionary as SchemasDictionary } from '@overture-stack/lectern-client';
import { Category, Dictionary, dictionaryCategories, NewCategory } from '@overture-stack/lyric-data-model/models';

import { BaseDependencies } from '../config/config.js';
import { ServiceUnavailable, StatusConflict } from '../utils/errors.js';
import { isValidIdNumber } from '../utils/formatUtils.js';

// Postgres' unique_violation code, via the `pg` driver's `.code` field. A race between an
// app-level uniqueness check and the write can still surface here, handled as 409, not 503.
const isUniqueConstraintViolation = (error: unknown): boolean => {
	return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
};

const repository = (dependencies: BaseDependencies) => {
	const LOG_MODULE = 'CATEGORY_REPOSITORY';
	const { db, logger } = dependencies;
	return {
		/**
		 * Save a new Category in Database
		 * @param data A Category object to be saved
		 * @returns The created Category
		 */
		save: async (data: NewCategory): Promise<Category> => {
			try {
				const savedCategory = await db.insert(dictionaryCategories).values(data).returning();
				if (!savedCategory[0]) {
					throw new Error(`Failed to insert Category '${data.name}', no row returned`);
				}
				logger.info(LOG_MODULE, `Category '${data.name}' saved successfully`);
				return savedCategory[0];
			} catch (error) {
				if (isUniqueConstraintViolation(error)) {
					logger.warn(LOG_MODULE, `Category '${data.name}' or its alias already exists (race with a concurrent request)`);
					throw new StatusConflict(`Category '${data.name}' or its alias is already in use`);
				}
				logger.error(LOG_MODULE, `Failed saving category '${data.name}'`, error);
				throw new ServiceUnavailable();
			}
		},

		categoryIdExists: async (categoryId: number): Promise<boolean> => {
			try {
				const categoryFound = await db
					.selectDistinct()
					.from(dictionaryCategories)
					.where(eq(dictionaryCategories.id, categoryId));
				let isValid = false;
				if (categoryFound && categoryFound.length === 1) {
					isValid = true;
				} else {
					logger.debug(LOG_MODULE, `Category ID'${categoryId}' doesn't exists`);
				}

				return isValid;
			} catch (error) {
				logger.error(LOG_MODULE, `Failed querying category with id ${categoryId}`, error);
				throw new ServiceUnavailable();
			}
		},

		/**
		 * Get a list of category names and id
		 * @returns {Promise<Pick<Category, 'alias' | 'id' | 'name'>[]>}
		 */
		getAllCategoryNames: async (): Promise<Pick<Category, 'alias' | 'id' | 'name'>[]> => {
			try {
				return await db.query.dictionaryCategories.findMany({
					columns: {
						alias: true,
						id: true,
						name: true,
					},
				});
			} catch (error) {
				logger.error(LOG_MODULE, `Failed querying category`, error);
				throw new ServiceUnavailable();
			}
		},

		/**
		 * Find a Category matching a category alias
		 * @param {string} alias Category alias
		 * @returns The Category found
		 */
		getCategoryByAlias: async (alias: string): Promise<Category | undefined> => {
			try {
				return await db.query.dictionaryCategories.findFirst({
					where: eq(dictionaryCategories.alias, alias),
				});
			} catch (error) {
				logger.error(LOG_MODULE, `Failed querying category`, error);
				throw new ServiceUnavailable();
			}
		},

		/**
		 * Find a Category by Id
		 * @param {number} id Category id
		 * @returns The Category found
		 */
		getCategoryById: async (id: number): Promise<(Category & { activeDictionary: Dictionary | null }) | undefined> => {
			try {
				return await db.query.dictionaryCategories.findFirst({
					where: eq(dictionaryCategories.id, id),
					with: {
						activeDictionary: true,
					},
				});
			} catch (error) {
				logger.error(LOG_MODULE, `Failed querying category`, error);
				throw new ServiceUnavailable();
			}
		},

		/**
		 * Find a Category by its numeric id or its alias; alias wins if both could match
		 * (see dictionary_categories.alias).
		 * @param {string} value Category id or alias
		 * @returns The Category found
		 */
		getCategoryByIdOrAlias: async (
			value: string,
		): Promise<(Category & { activeDictionary: Dictionary | null }) | undefined> => {
			try {
				const byAlias = await db.query.dictionaryCategories.findFirst({
					where: eq(dictionaryCategories.alias, value),
					with: {
						activeDictionary: true,
					},
				});
				if (byAlias) {
					return byAlias;
				}

				const parsedId = parseInt(value);
				if (!isValidIdNumber(parsedId)) {
					return undefined;
				}

				return await db.query.dictionaryCategories.findFirst({
					where: eq(dictionaryCategories.id, parsedId),
					with: {
						activeDictionary: true,
					},
				});
			} catch (error) {
				logger.error(LOG_MODULE, `Failed querying category`, error);
				throw new ServiceUnavailable();
			}
		},

		/**
		 * Find a Category matching a category name
		 * @param {string} name Category name
		 * @returns The Category found
		 */
		getCategoryByName: async (name: string): Promise<Category | undefined> => {
			try {
				return await db.query.dictionaryCategories.findFirst({
					where: eq(dictionaryCategories.name, name),
				});
			} catch (error) {
				logger.error(LOG_MODULE, `Failed querying category`, error);
				throw new ServiceUnavailable();
			}
		},

		/**
		 * Finds the current Dictionary for a Category
		 * @param {number} categoryId Category ID
		 * @returns The current Dictionary for this category
		 */
		getActiveDictionaryByCategory: async (
			categoryId: number,
		): Promise<(SchemasDictionary & { id: number }) | undefined> => {
			try {
				const result = await db.query.dictionaryCategories.findFirst({
					where: eq(dictionaryCategories.id, categoryId),
					with: {
						activeDictionary: {
							columns: {
								id: true,
								name: true,
								version: true,
								dictionary: true,
							},
						},
					},
				});
				if (result?.activeDictionary) {
					return {
						id: result.activeDictionary.id,
						version: result?.activeDictionary.version,
						name: result?.activeDictionary.name,
						schemas: result?.activeDictionary.dictionary,
					};
				}
				return undefined;
			} catch (error) {
				logger.error(LOG_MODULE, `Failed get Active Dictionary By Category '${categoryId}'`, error);
				throw new ServiceUnavailable();
			}
		},

		/**
		 * Update a Category record in database
		 * @param categoryId The Category ID
		 * @param newData Set fields to update
		 * @returns The updated record
		 */
		update: async (categoryId: number, newData: Partial<Category>): Promise<Category> => {
			try {
				const updated = await db
					.update(dictionaryCategories)
					.set({ ...newData, updatedAt: new Date() })
					.where(eq(dictionaryCategories.id, categoryId))
					.returning();
				if (!updated[0]) {
					throw new Error(`Failed to update Category with id '${categoryId}', no row returned`);
				}
				return updated[0];
			} catch (error) {
				if (isUniqueConstraintViolation(error)) {
					logger.warn(
						LOG_MODULE,
						`Update to Category '${categoryId}' conflicts with an existing name or alias (race with a concurrent request)`,
					);
					throw new StatusConflict(`The requested change conflicts with an existing category's name or alias`);
				}
				logger.error(LOG_MODULE, `Failed updating Category`, error);
				throw new ServiceUnavailable();
			}
		},
	};
};

export default repository;
