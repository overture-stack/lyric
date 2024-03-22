import { eq } from 'drizzle-orm/sql';

import { SchemasDictionary } from '@overturebio-stack/lectern-client/lib/schema-entities.js';
import { Dependencies } from '../config/config.js';
import { Category, NewCategory, dictionaryCategories } from '../models/dictionary_categories.js';
import { ServiceUnavailable } from '../utils/errors.js';

const repository = (dependencies: Dependencies) => {
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
	};
};

export default repository;
