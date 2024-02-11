import { getCurrentDictionary as currentDictionary } from 'common';

export const getCurrentDictionary = async () => {
	// TODO: use lib methods to get current dictionary
	return await currentDictionary();
};
