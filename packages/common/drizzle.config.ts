import type { Config } from 'drizzle-kit';
export default {
	schema: './src/models/*',
	out: './migrations',
} satisfies Config;
