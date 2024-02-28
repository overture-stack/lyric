import swaggerJSDoc from 'swagger-jsdoc';

import { version } from './manifest.js';

const swaggerDefinition = {
	failOnErrors: true, // Whether or not to throw when parsing errors. Defaults to false.
	openapi: '3.0.0',
	info: {
		title: 'Submission service',
		version: version,
	},
};

const options = {
	swaggerDefinition,
	// Paths to files containing OpenAPI definitions
	apis: ['./src/routes/*.ts'],
};

export default swaggerJSDoc(options);
