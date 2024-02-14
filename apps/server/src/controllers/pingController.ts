import { Request, Response } from 'express';

import { version } from '../../package.json';

export const ping = (req: Request, res: Response) => {
	res.send({ version });
};
