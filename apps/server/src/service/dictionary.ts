import { getCurrentDictionary as currentDictionary } from 'common';

export const getCurrentDictionary = async () => {
	// TODO: use lib methods to get current dictionary
	return await currentDictionary();
};

export const registerNewDictionary = async () => {
	// TODO: import lib methods to register new dictionary
	return 'OK';
};
