import { SelectedFields } from 'drizzle-orm/pg-core/query-builders/select.types';
import { SQL, eq } from 'drizzle-orm/sql';
import { isEmpty } from 'lodash-es';

import { SchemasDictionary } from '@overturebio-stack/lectern-client/lib/schema-entities.js';
import { Dependencies } from '../config/config.js';
import { Category, NewCategory, dictionaryCategories } from '../models/dictionary_categories.js';
import { BadRequest, ServiceUnavailable } from '../utils/errors.js';

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
		 * Find a Category in Database
		 * @param selectionFields Specific fields we want to get. Use '{}' (empty Object) to get all the fields from a Category
		 * @param conditions SQL where clause
		 * @returns The Category found
		 */
		select: async <P extends Partial<(typeof dictionaryCategories)['_']['columns']>>(
			selectionFields: P,
			conditions: SQL<unknown> | ((aliases: SelectedFields) => SQL<unknown> | undefined) | undefined,
		): Promise<Category[]> => {
			try {
				let result;
				if (isEmpty(selectionFields)) result = await db.select().from(dictionaryCategories).where(conditions);
				result = await db.select(selectionFields).from(dictionaryCategories).where(conditions);
				logger.debug(LOG_MODULE, `Found Categories '${result?.map((cat) => cat?.name)}' in database`);
				return result;
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
		getActiveDictionaryByCategory: async (categoryId: number): Promise<SchemasDictionary & { id: number }> => {
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
					logger.debug(
						LOG_MODULE,
						`Found category '${result?.name}' with  dictionary '${result?.activeDictionary.name}' version '${result?.activeDictionary.version}'`,
					);
					return {
						id: result.activeDictionary.id,
						version: result?.activeDictionary.version,
						name: result?.activeDictionary.name,
						schemas: result?.activeDictionary.dictionary,
					};
				}
				throw new BadRequest(`Dictionary in category '${categoryId}' not found`);
			} catch (error) {
				logger.error(LOG_MODULE, `Failed get Active Dictionary By Category '${categoryId}'`, error);
				throw new ServiceUnavailable();
			}
		},
	};
};

export default repository;
