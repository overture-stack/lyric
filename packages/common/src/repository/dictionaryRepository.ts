import { SelectedFields } from 'drizzle-orm/pg-core/query-builders/select.types';
import { SQL } from 'drizzle-orm/sql';
import { isEmpty } from 'lodash-es';

import { GlobalConfig } from '../config/config.js';
import { Dictionary, NewDictionary, dictionaries } from '../models/dictionaries.js';

export default class DictionaryRepository extends GlobalConfig {
	async save(data: NewDictionary) {
		const { db, logger } = this.dependencies;
		try {
			const savedDictionary = await db.drizzle.insert(dictionaries).values(data).returning();
			logger.info(`Dictionary with name:${data.name} and version:${data.version} saved successfully`);
			return savedDictionary;
		} catch (error) {
			logger.error(`Failed saving Dictionary with: name ${data.name}, version:${data.version}. Details: ${error}`);
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
		const { db, logger } = this.dependencies;
		logger.debug(`Querying Dictionary`);
		try {
			if (isEmpty(selectionFields)) return await db.drizzle.select().from(dictionaries).where(conditions);
			return await db.drizzle.select(selectionFields).from(dictionaries).where(conditions);
		} catch (error) {
			logger.error(`Failed querying Dictionary. Details: ${error}`);
			throw error;
		}
	}
}
