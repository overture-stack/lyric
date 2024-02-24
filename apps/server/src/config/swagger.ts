import swaggerJSDoc from 'swagger-jsdoc';

import pkg from '../../package.json' assert { type: 'json' };

const swaggerDefinition = {
	failOnErrors: true, // Whether or not to throw when parsing errors. Defaults to false.
	openapi: '3.0.0',
	info: {
		title: 'Submission service',
		version: pkg.version,
	},
};

const options = {
	swaggerDefinition,
	// Paths to files containing OpenAPI definitions
	apis: ['./src/routes/*.ts'],
};

export default swaggerJSDoc(options);
