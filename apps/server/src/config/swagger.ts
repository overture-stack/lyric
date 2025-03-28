import swaggerJSDoc from 'swagger-jsdoc';

import { version } from './manifest.js';

const swaggerDefinition: swaggerJSDoc.OAS3Definition = {
	failOnErrors: true, // Whether or not to throw when parsing errors. Defaults to false.
	openapi: '3.0.1',
	info: {
		title: 'Lyric',
		version,
	},
};

const options: swaggerJSDoc.OAS3Options = {
	swaggerDefinition,
	// Paths to files containing OpenAPI definitions
	apis: ['./src/routes/*.ts', './swagger/*.yml'],
};

export default swaggerJSDoc(options);
