export type Success<SuccessData> = {
	success: true;
	data: SuccessData;
};

type DefaultFailureData = string;

export type Failure<FailureData = DefaultFailureData> = {
	success: false;
	data: FailureData;
};

/**
 * Represents a response that on success will include data of type T,
 * otherwise a message will be returned in place of the data explaining the failure.
 *
 * Optionally, a data type can be provided for the failure case.
 */
export type Result<SuccessData, FailureData = DefaultFailureData> = Success<SuccessData> | Failure<FailureData>;
/**
 * Create a successful response for a Result or Either type, with data of the success type
 * @param {T} data
 * @returns {Success<T>} `{success: true, data}`
 */
export const success = <T>(data: T): Success<T> => {
	return {
		success: true,
		data,
	};
};

/**
 * Create a failure response with data.
 * @param {T} data
 * @returns {Failure<T>} `{success: false, data}`
 */
export const failure = <T>(data: T): Failure<T> => {
	return {
		success: false,
		data,
	};
};
