import { SelectedFields } from 'drizzle-orm/pg-core/query-builders/select.types';
import { SQL } from 'drizzle-orm/sql';
import { isEmpty } from 'lodash-es';

import { Dependencies } from '../config/config.js';
import { Category, NewCategory, dictionaryCategories } from '../models/dictionary_categories.js';

const repository = (dependencies: Dependencies) => {
	return {
		save: async (data: NewCategory): Promise<Category> => {
			const { db, logger } = dependencies;
			try {
				const savedCategory = await db.insert(dictionaryCategories).values(data).returning();
				logger.info(`Category ${data.name} saved successfully`);
				return savedCategory[0];
			} catch (error) {
				logger.error(`Failed saving category ${data.name}. Details: ${error}`);
				throw error;
			}
		},

		select: async (
			selectionFields: SelectedFields | undefined,
			conditions: SQL<unknown> | ((aliases: SelectedFields) => SQL<unknown> | undefined) | undefined,
		): Promise<
			| Category[]
			| {
					[x: string]: unknown;
			  }[]
		> => {
			const { db, logger } = dependencies;
			logger.debug(`Querying Category`);
			try {
				if (isEmpty(selectionFields)) return await db.select().from(dictionaryCategories).where(conditions);
				return await db.select(selectionFields).from(dictionaryCategories).where(conditions);
			} catch (error) {
				logger.error(`Failed querying category. Details: ${error}`);
				throw error;
			}
		},
	};
};

export default repository;
