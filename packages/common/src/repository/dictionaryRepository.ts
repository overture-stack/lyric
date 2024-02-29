import { SelectedFields } from 'drizzle-orm/pg-core/query-builders/select.types';
import { SQL } from 'drizzle-orm/sql';
import { isEmpty } from 'lodash-es';

import { Dependencies } from '../config/config.js';
import { Dictionary, NewDictionary, dictionaries } from '../models/dictionaries.js';

const repository = (dependencies: Dependencies) => {
	return {
		save: async (data: NewDictionary): Promise<Dictionary> => {
			const { db, logger } = dependencies;
			try {
				const savedDictionary = await db.insert(dictionaries).values(data).returning();
				logger.info(`Dictionary with name:${data.name} and version:${data.version} saved successfully`);
				return savedDictionary[0];
			} catch (error) {
				logger.error(`Failed saving Dictionary with: name ${data.name}, version:${data.version}. Details: ${error}`);
				throw error;
			}
		},

		select: async (
			selectionFields: SelectedFields | undefined,
			conditions: SQL<unknown> | ((aliases: SelectedFields) => SQL<unknown> | undefined) | undefined,
		): Promise<
			| Dictionary[]
			| {
					[x: string]: unknown;
			  }[]
		> => {
			const { db, logger } = dependencies;
			logger.debug(`Querying Dictionary`);
			try {
				if (isEmpty(selectionFields)) return await db.select().from(dictionaries).where(conditions);
				return await db.select(selectionFields).from(dictionaries).where(conditions);
			} catch (error) {
				logger.error(`Failed querying Dictionary. Details: ${error}`);
				throw error;
			}
		},
	};
};

export default repository;
