import { eq } from 'drizzle-orm/sql';
import { ListAllCategoriesResponse } from 'src/utils/types.js';

import { Category, Dictionary, dictionaryCategories, NewCategory } from '@overture-stack/lyric-data-model';
import { SchemasDictionary } from '@overturebio-stack/lectern-client/lib/schema-entities.js';

import { BaseDependencies } from '../config/config.js';
import { ServiceUnavailable } from '../utils/errors.js';

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
				logger.info(LOG_MODULE, `Category '${data.name}' saved successfully`);
				return savedCategory[0];
			} catch (error) {
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
		 * @returns {Promise<ListAllCategoriesResponse[]>}
		 */
		getAllCategoryNames: async (): Promise<ListAllCategoriesResponse[]> => {
			try {
				return await db.query.dictionaryCategories.findMany({
					columns: {
						id: true,
						name: true,
					},
				});
			} catch (error: any) {
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
			} catch (error: any) {
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
			} catch (error: any) {
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
				return updated[0];
			} catch (error) {
				logger.error(LOG_MODULE, `Failed updating Category`, error);
				throw new ServiceUnavailable();
			}
		},
	};
};

export default repository;
