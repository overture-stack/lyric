import { expect } from 'chai';
import { describe, it } from 'mocha';

import type { SubmissionUpdateData } from '@overture-stack/lyric-data-model/models';

import { mergeUpdatesBySystemId } from '../../../src/utils/submissionUtils.js';

describe('Submission Utils - Merge multiple Submission Update records', () => {
	it('should return an object with 2 recrods withing the same key', () => {
		const update1: Record<string, SubmissionUpdateData[]> = {
			animal: [{ systemId: 'GRL3839', new: { name: 'Gorilla' }, old: { name: 'alliroG' } }],
		};
		const update2: Record<string, SubmissionUpdateData[]> = {
			animal: [{ systemId: 'CAM1929', new: { name: 'Cammel' }, old: { name: 'lemmaC' } }],
		};
		const result = mergeUpdatesBySystemId(update1, update2);
		expect(Object.keys(result).length).eq(1);
		expect(Object.keys(result)[0]).eql('animal');
		expect(result['animal'].length).eq(2);
		expect(result['animal']).eql([
			{ systemId: 'GRL3839', new: { name: 'Gorilla' }, old: { name: 'alliroG' } },
			{ systemId: 'CAM1929', new: { name: 'Cammel' }, old: { name: 'lemmaC' } },
		]);
	});
	it('should return an object with 2 records with different key', () => {
		const update1: Record<string, SubmissionUpdateData[]> = {
			animal: [{ systemId: 'GRL3839', new: { name: 'Gorilla' }, old: { name: 'alliroG' } }],
		};
		const update2: Record<string, SubmissionUpdateData[]> = {
			movies: [{ systemId: 'SPD001', new: { name: 'Spiderman' }, old: { name: 'Spidey' } }],
		};
		const result = mergeUpdatesBySystemId(update1, update2);
		expect(Object.keys(result).length).eq(2);
		expect(Object.keys(result)).eql(['animal', 'movies']);
		expect(result['animal'].length).eq(1);
		expect(result['animal'][0]).eql({ systemId: 'GRL3839', new: { name: 'Gorilla' }, old: { name: 'alliroG' } });
		expect(result['movies'].length).eq(1);
		expect(result['movies'][0]).eql({ systemId: 'SPD001', new: { name: 'Spiderman' }, old: { name: 'Spidey' } });
	});
	it('should avoid duplication and return an object with 1 record', () => {
		const update1: Record<string, SubmissionUpdateData[]> = {
			movies: [{ systemId: 'SPD001', new: { name: 'Spiderman' }, old: { name: 'Spidey' } }],
		};
		const update2: Record<string, SubmissionUpdateData[]> = {
			movies: [{ systemId: 'SPD001', new: { name: 'Spiderman' }, old: { name: 'Spidey' } }],
		};
		const update3: Record<string, SubmissionUpdateData[]> = {
			movies: [{ systemId: 'SPD001', new: { name: 'Spiderman' }, old: { name: 'Spidey' } }],
		};
		const result = mergeUpdatesBySystemId(update1, update2, update3);
		expect(Object.keys(result).length).eq(1);
		expect(Object.keys(result)[0]).eql('movies');
		expect(result['movies'].length).eq(1);
		expect(result['movies'][0]).eql({ systemId: 'SPD001', new: { name: 'Spiderman' }, old: { name: 'Spidey' } });
	});
});
