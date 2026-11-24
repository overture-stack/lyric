import { resolve } from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import dts from 'unplugin-dts/vite';
import { defineConfig } from 'vite';

import pkg from './package.json' with { type: 'json' };

// Dependencies and peer dependencies are installed by the consumer, so keep them (and their subpaths, e.g. react/jsx-runtime) out of the bundle
const externalPackages = [...Object.keys(pkg.dependencies), ...Object.keys(pkg.peerDependencies)];
const isExternal = (id: string) => externalPackages.some((name) => id === name || id.startsWith(`${name}/`));

export default defineConfig({
	plugins: [
		react(),
		tailwindcss(),
		dts({ outDirs: ['dist', { dir: 'dist', moduleFormat: 'cjs' }], tsconfigPath: './tsconfig.build.json' }),
	],
	resolve: {
		alias: {
			'@': resolve(import.meta.dirname, './src'),
		},
	},
	build: {
		lib: {
			entry: resolve(import.meta.dirname, 'src/entry.ts'),
			name: 'LyricUI',
			fileName: 'lyric-ui',
			cssFileName: 'style',
			formats: ['es', 'cjs'],
		},
		rolldownOptions: {
			external: isExternal,
		},
		cssCodeSplit: false,
	},
});
