/**
 * Creates a TSV (tab-separated values) file buffer from the given headers and rows.
 * The output from this file can be attached to a request to simulate an uploaded TSV file.
 *
 * @param headers - Column names for the first line of the file.
 * @param rows - Data rows, where each inner array corresponds to one row of values.
 * @returns A `Buffer` containing the TSV content, suitable for passing to supertest's `.attach()`.
 *
 * @example
 * // create test TSV file
 * const content = createTsvFileContent(
 *   ['sport_id', 'name'],
 *   [['1', 'Soccer'], ['2', 'Basketball']],
 * );
 *
 * // Use as file in supertest request
 * await app.post('/category/1/files?organization=testOrg').attach('files', content, 'sport.tsv');
 *
 */
export function createTsvFileContent(headers: string[], rows: string[][]): Buffer {
	const lines = [headers.join('\t'), ...rows.map((row) => row.join('\t'))];
	return Buffer.from(lines.join('\n'));
}
