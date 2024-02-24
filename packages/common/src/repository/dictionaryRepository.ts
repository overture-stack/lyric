import { SelectedFields } from 'drizzle-orm/pg-core/query-builders/select.types';
import { SQL } from 'drizzle-orm/sql';
import { isEmpty } from 'lodash-es';

import { GlobalConfig } from '../config/config.js';
import { Dictionary, NewDictionary, dictionaries } from '../models/dictionaries.js';

export default class DictionaryRepository extends GlobalConfig {
	async save(data: NewDictionary) {
		console.log('saving dictionary');
		try {
			const { db } = this.dependencies;
			return await db.drizzle.insert(dictionaries).values(data).returning();
		} catch (error) {
			throw error;
		}
	}

	async select(
		selectionFields: SelectedFields | undefined,
		conditions: SQL<unknown> | ((aliases: SelectedFields) => SQL<unknown> | undefined) | undefined,
	): Promise<
		| Dictionary[]
		| {
				[x: string]: unknown;
		  }[]
	> {
		console.log('selecting dictionary');
		try {
			const { db } = this.dependencies;
			if (isEmpty(selectionFields)) return await db.drizzle.select().from(dictionaries).where(conditions);
			return await db.drizzle.select(selectionFields).from(dictionaries).where(conditions);
		} catch (error) {
			throw error;
		}
	}
}
