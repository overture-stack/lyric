import { SelectedFields } from 'drizzle-orm/pg-core/query-builders/select.types';
import { SQL } from 'drizzle-orm/sql';
import { isEmpty } from 'lodash-es';

import { GlobalConfig } from '../config/config.js';
import { Category, NewCategory, dictionaryCategories } from '../models/dictionary_categories.js';

export default class CategoryRepository extends GlobalConfig {
	async save(data: NewCategory): Promise<Category> {
		console.log('saving Category');
		try {
			const { db } = this.dependencies;
			const savedCategory = await db.drizzle.insert(dictionaryCategories).values(data).returning();
			return savedCategory[0];
		} catch (error) {
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
		console.log('selecting Category');
		try {
			const { db } = this.dependencies;
			await db.connect();
			if (isEmpty(selectionFields)) return await db.drizzle.select().from(dictionaryCategories).where(conditions);
			return await db.drizzle.select(selectionFields).from(dictionaryCategories).where(conditions);
		} catch (error) {
			throw error;
		}
	}
}
