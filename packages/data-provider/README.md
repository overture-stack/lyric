# Lyric (Data Provider)

Package published on npm as https://www.npmjs.com/@overture-stack/lyric

This package is part of Lyric mono repo, for more details go to [main page](../../README.md)

## Available scripts

| Command          | Description                                                            |
| ---------------- | ---------------------------------------------------------------------- |
| `pnpm build:all` | Compile typescript code in the workspace and generate database schemas |
| `pnpm start:dev` | Run code for development                                               |

## Package structure

Source code is distributed on `src` folder as follows:

```
├── src
│   ├── config
│   ├── controllers
│   ├── core
│   ├── external
│   ├── middleware
│   ├── repository
│   ├── routers
│   ├── services
│   └── utils
```

### Adding a Service

Create a service file `helloService.ts` on folder `src/services` with the following content.

```
import { BaseDependencies } from '../config/config.js';

const service = (dependencies: BaseDependencies) => {
	const { logger } = dependencies;
	return {
		sayHi: (name: string): string => {
			const message = `Hello ${name}`;
			logger.debug('sayHi', message);
			return message;
		},
	};
};

export default service;
```

Use the argument of type `BaseDependencies` to retrieve service configurations for logger or other external services like database configurations, etc.

Make sure to follow the instructions to export the resource accordingly. [link](#export-resource)

### Adding a Controller

Create a controller file `helloController.ts` on folder `src/controllers` with the following content.

```
import { NextFunction, Request, Response } from 'express';
import { BaseDependencies } from '../config/config.js';
import helloService from '../services/helloService.js';

const controller = (dependencies: BaseDependencies) => {
    const service = helloService(dependencies);

	return {
		hello: async (req: Request<{ name: string }>, res: Response, next: NextFunction) => {
			try {
				const name = req.params.name;

				const response = service.sayHi(name);
				return res.send(response);
			} catch (error) {
				next(error);
			}
		},
	};
};

export default controller;
```

Use the argument of type `BaseDependencies` to retrieve service configurations for logger or other external services like database configurations, etc.

Make sure to follow the instructions to export the resource accordingly. [link](#export-resource)

### Adding a Router

Use the `express.Router` class to create modular route handlers.

Create a router file `helloRouter.ts` on folder `src/routers` with the following content.

```
import { Request, Response, Router } from 'express';

const router = (): Router => {
	const router = Router();

	router.get('/hello', (req: Request, res: Response) => {
		res.send('Hello world');
	});
	return router;
};

export default router;
```

Make sure to follow the instructions to export the resource accordingly. [link](#export-resource)

### Installing a dependency

> Note: Run following command only from the monorepo root level.

Use the command `pnpm add package-name` to add a dependency to the monorepo. Add the option `--workspace data-provider` to add a dependency only to an specific project.

Add `-D` option to add to `devDependencies`

### Export a resource

To export this resource as an individual resource include the exported resource on to the root `index.ts` file.

To be used as part of Lyric provider include the resource on the `core/provider.ts` file.
|
