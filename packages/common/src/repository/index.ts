import { drizzle } from 'drizzle-orm/node-postgres';
import { PgInsertValue } from 'drizzle-orm/pg-core/query-builders/insert';
import { SelectedFields } from 'drizzle-orm/pg-core/query-builders/select.types';
import { PgTable } from 'drizzle-orm/pg-core/table';

import { db } from '../config/dbSingleton';

export class Repository {
	save(data: PgInsertValue<PgTable> | PgInsertValue<PgTable>[], entity: PgTable): any {
		db.drizzle.insert(entity).values(data).returning();
	}

	select(selectionFields: SelectedFields, entity: PgTable) {
		db.drizzle.select(selectionFields).from(entity);
	}
}
