import type { Config } from 'drizzle-kit';
export default {
	schema: ['./dist/src/models/*'],
	out: './migrations',
} satisfies Config;
