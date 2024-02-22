import { Request, Response } from 'express';

import * as dictionaryService from '../services/dictionaryService';

export const getCurrentDictionary = async (req: Request, res: Response) => {
	// const currentDictionary = await dictionaryService.getCurrentDictionary();
	// res.send(currentDictionary);
	res.status(200).send();
};

export const registerDictionary = async (req: Request, res: Response) => {
	const categoryName = req.body.categoryName;
	const dictinaryName = req.body.dictionaryName;
	const dictionaryVersion = req.body.version;

	if (!categoryName) throw new Error('Request is missing `categoryName` parameter.');
	if (!dictinaryName) throw new Error('Request is missing `dictinaryName` parameter.');
	if (!dictionaryVersion) throw new Error('Request is missing `version` parameter.');

	const registered = await dictionaryService.registerDictionary(categoryName, dictinaryName, dictionaryVersion);
	res.send(registered);
};
