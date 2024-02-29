import { Request, Response } from 'express';

import { name, version } from '../config/manifest.js';

const ping = (req: Request, res: Response) => {
	res.send({ name: name, version: version });
};

export default { ping };
