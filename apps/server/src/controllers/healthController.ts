import { Request, Response } from 'express';

const health = (req: Request, res: Response) => {
	const healthcheck = {
		uptime: process.uptime(),
		message: 'OK',
		timestamp: Date.now(),
	};
	res.send(healthcheck);
};

export default { health };
