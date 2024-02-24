import { Request, Response } from 'express';

import { Dependencies } from '../config/config.js';
import DictionaryService from '../services/dictionaryService.js';

export const dictionaryControllers = (dependencies: Dependencies) => {
	const dictionaryService = new DictionaryService(dependencies);
	return {
		getCurrentDictionary: async (req: Request, res: Response) => {
			// const currentDictionary = await dictionaryService.getCurrentDictionary();
			// res.send(currentDictionary);
			res.status(200).send();
		},

		registerDictionary: async (req: Request, res: Response) => {
			const categoryName = req.body.categoryName;
			const dictinaryName = req.body.dictionaryName;
			const dictionaryVersion = req.body.version;

			if (!categoryName) throw new Error('Request is missing `categoryName` parameter.');
			if (!dictinaryName) throw new Error('Request is missing `dictinaryName` parameter.');
			if (!dictionaryVersion) throw new Error('Request is missing `version` parameter.');

			const registered = await dictionaryService.registerDictionary(categoryName, dictinaryName, dictionaryVersion);
			res.send(registered);
		},
	};
};
