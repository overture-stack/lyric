import { Request, Response } from 'express';

import * as dictionaryService from '../service/dictionary';

export const getCurrentDictionary = async (req: Request, res: Response) => {
	const currentDictionary = await dictionaryService.getCurrentDictionary();
	res.send(currentDictionary);
};

export const registerDictionary = async (req: Request, res: Response) => {
	const registered = await dictionaryService.registerNewDictionary();
	res.send(registered);
};
