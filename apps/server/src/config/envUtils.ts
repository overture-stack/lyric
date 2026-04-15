export const getBoolean = (env: string | undefined, defaultValue: boolean): boolean => {
	switch ((env ?? '').toLocaleLowerCase()) {
		case 'true':
			return true;
		case 'false':
			return false;
		default:
			return defaultValue;
	}
};

export const getRequiredConfig = (name: string) => {
	const value = process.env[name];
	if (!value) {
		throw new Error(`No Environment Variable provided for required configuration parameter '${name}'`);
	}
	return value;
};

export const getJSONConfig = (name: string) => {
	const value = process.env[name];

	if (!value) {
		return;
	}

	try {
		return JSON.parse(value);
	} catch (error) {
		throw new Error(`Environment variable '${name}' must be a valid JSON.`);
	}
};

export const getOptionalIntegerConfig = (name: string): number | undefined => {
	const value = process.env[name];

	if (value === undefined || value === '') {
		return undefined;
	}
	const number = Number(value);

	if (!(Number.isFinite(number) && Number.isInteger(number))) {
		throw new Error(`Environment variable '${name}' must be an integer. Recieved invalid value ${value}`);
	}
	return number;
};
