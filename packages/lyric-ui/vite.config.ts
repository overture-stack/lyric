import { resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			'@': resolve(__dirname, './src'),
		},
	},
	build: {
		lib: {
			entry: resolve(__dirname, 'src/index.ts'),
			name: 'LyricUI',
			fileName: 'lyric-ui',
			formats: ['es', 'cjs'],
		},
		rollupOptions: {
			external: ['react', 'react-dom', 'react/jsx-runtime'],
		},
		cssCodeSplit: false,
	},
});
