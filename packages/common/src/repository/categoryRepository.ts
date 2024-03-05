import { SelectedFields } from 'drizzle-orm/pg-core/query-builders/select.types';
import { SQL } from 'drizzle-orm/sql';
import { isEmpty } from 'lodash-es';

import { Dependencies } from '../config/config.js';
import { Category, NewCategory, dictionaryCategories } from '../models/dictionary_categories.js';
import { ServiceUnavailable } from '../utils/errors.js';

const repository = (dependencies: Dependencies) => {
	const LOG_MODULE = 'CATEGORY_REPOSITORY';
	const { db, logger } = dependencies;
	return {
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

		select: async <P extends Partial<(typeof dictionaryCategories)['_']['columns']>>(
			selectionFields: P,
			conditions: SQL<unknown> | ((aliases: SelectedFields) => SQL<unknown> | undefined) | undefined,
		): Promise<Category[]> => {
			logger.debug(LOG_MODULE, `Querying Category`);
			try {
				if (isEmpty(selectionFields)) return await db.select().from(dictionaryCategories).where(conditions);
				return await db.select(selectionFields).from(dictionaryCategories).where(conditions);
			} catch (error: any) {
				logger.error(LOG_MODULE, `Failed querying category`, error);
				throw new ServiceUnavailable();
			}
		},
	};
};

export default repository;
