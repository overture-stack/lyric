import { expect } from 'chai';

/**
 * Asserts that the value is not null or undefined.
 * This lets TypeScript know the value is of type T after this check.
 * @param value The value to check for existence.
 */
export function assertExists<T>(value: T | null | undefined): asserts value is T {
	expect(value).to.exist;
}
