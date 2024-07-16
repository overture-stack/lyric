import js from '@eslint/js';
import prettierPlugin from 'eslint-plugin-prettier';
import simpleImportSortPlugin from 'eslint-plugin-simple-import-sort';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	// register all of the plugins up-front
	{
		plugins: {
			['@typescript-eslint']: tseslint.plugin,
			['simple-import-sort']: simpleImportSortPlugin,
			['prettier']: prettierPlugin,
		},
	},

	// config with just ignores is the replacement for `.eslintignore`
	{
		ignores: ['**/dist', '**/package-lock.json', '**/package.json'],
	},

	// extends ...
	js.configs.recommended,
	...tseslint.configs.recommended,

	// base config
	{
		rules: {
			'@typescript-eslint/no-unused-vars': [
				'warn',
				{
					argsIgnorePattern: '^_',
				},
			],
			'simple-import-sort/imports': [
				'warn',
				{
					groups: [
						// Side effect imports.
						['^\\u0000'],
						// Node.js builtins prefixed with `node:`.
						['^node:'],
						// Packages.
						// Things that start with a letter (or digit or underscore), or `@` followed by a letter.
						['^@?\\w'],
						// Internal packages.
						['^(@overturebio-stack|@overture-stack)'],
						// Absolute imports and other imports such as Vue-style `@/foo`.
						// Anything not matched in another group.
						['^'],
						// Relative imports.
						// Anything that starts with a dot.
						['^\\.'],
					],
				},
			],
			'simple-import-sort/exports': 'error',
			'prettier/prettier': 'error',
		},
		languageOptions: {
			parserOptions: {
				ecmaVersion: 'latest',
				sourceType: 'module',
			},
		},
	},
);
