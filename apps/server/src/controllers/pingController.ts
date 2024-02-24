import { Request, Response } from 'express';

import pkg from '../../package.json' assert { type: 'json' };

export const ping = (req: Request, res: Response) => {
	res.send({ name: pkg.name, version: pkg.version });
};
