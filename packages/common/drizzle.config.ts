import type { Config } from 'drizzle-kit';
export default {
	schema: './src/schema/schema.ts',
	out: './drizzle',
} satisfies Config;
