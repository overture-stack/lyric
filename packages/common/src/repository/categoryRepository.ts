import { SelectedFields } from 'drizzle-orm/pg-core/query-builders/select.types';
import { SQL } from 'drizzle-orm/sql';
import { isEmpty } from 'lodash-es';

import { GlobalConfig } from '../config/config.js';
import { Category, NewCategory, dictionaryCategories } from '../models/dictionary_categories.js';

export default class CategoryRepository extends GlobalConfig {
	async save(data: NewCategory): Promise<Category> {
		const { db, logger } = this.dependencies;
		try {
			const savedCategory = await db.drizzle.insert(dictionaryCategories).values(data).returning();
			logger.info(`Category ${data.name} saved successfully`);
			return savedCategory[0];
		} catch (error) {
			logger.error(`Failed saving category ${data.name}. Details: ${error}`);
			throw error;
		}
	}

	async select(
		selectionFields: SelectedFields | undefined,
		conditions: SQL<unknown> | ((aliases: SelectedFields) => SQL<unknown> | undefined) | undefined,
	): Promise<
		| Category[]
		| {
				[x: string]: unknown;
		  }[]
	> {
		const { db, logger } = this.dependencies;
		logger.debug(`Querying Category`);
		try {
			await db.connect();
			if (isEmpty(selectionFields)) return await db.drizzle.select().from(dictionaryCategories).where(conditions);
			return await db.drizzle.select(selectionFields).from(dictionaryCategories).where(conditions);
		} catch (error) {
			logger.error(`Failed querying category. Details: ${error}`);
			throw error;
		}
	}
}
