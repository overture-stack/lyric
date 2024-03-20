import { SelectedFields } from 'drizzle-orm/pg-core/query-builders/select.types';
import { SQL, eq } from 'drizzle-orm/sql';
import { isEmpty } from 'lodash-es';

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
				if (isEmpty(selectionFields)) {
					result = await db.select().from(dictionaryCategories).where(conditions);
				} else {
					result = await db.select(selectionFields).from(dictionaryCategories).where(conditions);
				}

				logger.debug(LOG_MODULE, `Found Categories '${result?.map((cat) => cat?.name)}' in database`);
				return result;
			} catch (error: any) {
				logger.error(LOG_MODULE, `Failed querying category`, error);
				throw new ServiceUnavailable();
			}
		},
		findFirst: async (
			whereClause: SQL<unknown> | ((aliases: SelectedFields) => SQL<unknown> | undefined) | undefined,
			withRelations: any,
		): Promise<any> => {
			try {
				const result = await db.query.dictionaryCategories.findFirst({
					where: whereClause,
					with: withRelations,
				});
				logger.debug(LOG_MODULE, `Found '${result?.name}' category in database`);
				return result;
			} catch (error) {
				logger.error(LOG_MODULE, `Failed FindFirst Query on Category`, error);
				throw new ServiceUnavailable();
			}
		},

		updateCurrentDictionaryOnCategory: async (dictionaryId: number, categoryId: number) => {
			try {
				return await db
					.update(dictionaryCategories)
					.set({
						activeDictionaryId: dictionaryId,
					})
					.where(eq(dictionaryCategories.id, categoryId));
			} catch (error) {
				logger.error(LOG_MODULE, `Failed update current dictionary on Category`, error);
				throw new ServiceUnavailable();
			}
		},
	};
};

export default repository;
