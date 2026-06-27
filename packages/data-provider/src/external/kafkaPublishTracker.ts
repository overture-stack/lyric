import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { models } from '@overture-stack/lyric-data-model';

/**
 * Returns an `onSuccess` handler for {@link createKafkaPublisher} that writes `published_at`
 * to the `submissions` row after a successful Kafka send.
 */
export const createPublishTracker =
	(db: NodePgDatabase<typeof models>) =>
	async (submissionId: number): Promise<void> => {
		await db
			.update(models.submissions)
			.set({ publishedAt: new Date() })
			.where(eq(models.submissions.id, submissionId));
	};
