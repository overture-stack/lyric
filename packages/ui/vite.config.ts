import { resolve } from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, esmExternalRequirePlugin } from 'vite';

export default defineConfig({
	plugins: [react(), tailwindcss()],
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
		rolldownOptions: {
			output: {
				banner: "import './lyric-ui.css';",
			},
			plugins: [
				esmExternalRequirePlugin({
					external: ['react', 'react-dom', 'react/jsx-runtime'],
				}),
			],
		},
		cssCodeSplit: false,
	},
});
