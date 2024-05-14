import { z as zod } from 'zod';
import { Clean, Values } from './types.js';

/* **** *
 * Keys *
 * **** */
export const ArrayFilterKeys = {
	In: 'in',
} as const;
export type ArrayFilterKey = Values<typeof ArrayFilterKeys>;

export const ScalarFilterKeys = {
	GreaterThan: 'gt',
	LesserThan: 'lt',
} as const;
export type ScalarFilterKey = Values<typeof ScalarFilterKeys>;

export type FilterKey = ScalarFilterKey | ArrayFilterKey;
export const FilterKeys = Object.assign({}, ArrayFilterKeys, ScalarFilterKeys);

export const CombinationKeys = {
	And: 'and',
	Or: 'or',
	Not: 'not',
} as const;
export type CombinationKey = Values<typeof CombinationKeys>;

export const Keys = Object.assign({}, ArrayFilterKeys, ScalarFilterKeys, CombinationKeys);

/* ****************** *
 * Filters            *
 * - Filter Values    *
 * - Specific Filters *
 * ****************** */

/* ===== Filter Values ==== */

// The array value wants to be able to accept a single value or an array of values
// Arranger also doesnt care if the values are mixed numbers and strings, that will be sorted out by elasticsearch
// and in practice won't be mixed, so to simlpify type validation we use this nested union structure:
// string | number | (string | number)[]
export type ArrayFilterValue = zod.infer<typeof ArrayFilterValue>;
export const ArrayFilterValue = zod.union([
	zod.union([zod.string(), zod.number()]).array(),
	zod.string(),
	zod.number(),
]);

export type ScalarFilterValue = zod.infer<typeof ScalarFilterValue>;
export const ScalarFilterValue = zod.number();

export type FilterValue = zod.infer<typeof FilterValue>;
export const FilterValue = zod.union([ArrayFilterValue, ScalarFilterValue]);

export type FilterTypeMap = {
	[ArrayFilterKeys.In]: InFilter;
	[ScalarFilterKeys.GreaterThan]: GreaterThanFilter;
	[ScalarFilterKeys.LesserThan]: LesserThanFilter;
};

/* ===== Specific Filters ==== */

export type InFilterContent = zod.infer<typeof InFilterContent>;
export const InFilterContent = zod.object({
	fieldName: zod.string(),
	value: ArrayFilterValue,
});
export type InFilter = zod.infer<typeof InFilter>;
export const InFilter = zod.object({
	op: zod.literal(ArrayFilterKeys.In),
	content: InFilterContent,
});

export type GreaterThanFilterContent = zod.infer<typeof GreaterThanFilterContent>;
export const GreaterThanFilterContent = zod.object({
	fieldName: zod.string(),
	value: ScalarFilterValue,
});
export type GreaterThanFilter = zod.infer<typeof GreaterThanFilter>;
export const GreaterThanFilter = zod.object({
	op: zod.literal(ScalarFilterKeys.GreaterThan),
	content: GreaterThanFilterContent,
});

export type LesserThanFilterContent = zod.infer<typeof LesserThanFilterContent>;
export const LesserThanFilterContent = zod.object({
	fieldName: zod.string(),
	value: ScalarFilterValue,
});
export type LesserThanFilter = zod.infer<typeof LesserThanFilter>;
export const LesserThanFilter = zod.object({
	op: zod.literal(ScalarFilterKeys.LesserThan),
	content: LesserThanFilterContent,
});

export type ArrayFilter = zod.infer<typeof ArrayFilter>;
export const ArrayFilter = InFilter; // zod.union([InFilter]); // If other arrays are added, expand this to be a union
export type ScalarFilter = zod.infer<typeof ScalarFilter>;
export const ScalarFilter = zod.union([GreaterThanFilter, LesserThanFilter]); // If other arrays are added, expand this to be a union

export type FilterContent = zod.infer<typeof FilterContent>;
export const FilterContent = zod.union([InFilterContent, GreaterThanFilterContent, LesserThanFilterContent]);
export type FilterOperator = zod.infer<typeof FilterOperator>;
export const FilterOperator = zod.discriminatedUnion('op', [InFilter, GreaterThanFilter, LesserThanFilter]);

/* ************ *
 * Combinations *
 * ************ */
// Combination is a recursive type, but Zod can't do TS type inference for recursive definitions.
// So in this one case we define the type first with the recursive structure and use it as a type-hint
// for our zod schema. Reference: https://zod.dev/?id=recursive-types
export type CombinationOperator = {
	op: CombinationKey;
	content: (CombinationOperator | FilterOperator)[];
	pivot?: string;
};
export const CombinationOperator: zod.ZodType<CombinationOperator> = zod.object({
	op: zod.union([zod.literal(CombinationKeys.And), zod.literal(CombinationKeys.Not), zod.literal(CombinationKeys.Or)]),
	content: zod.array(zod.union([FilterOperator, zod.lazy(() => CombinationOperator)])),
	pivot: zod.string().optional(),
});

export const Operator = zod.union([CombinationOperator, FilterOperator]);
export type Operator = zod.infer<typeof Operator>;

export const SQON = Operator;
export type SQON = Clean<Operator>;

/* ===== Convenient Type Guards ===== */
export const isCombination = (operator: Operator): operator is CombinationOperator =>
	CombinationOperator.safeParse(operator).success;

export const isFilter = (operator: Operator): operator is FilterOperator => FilterOperator.safeParse(operator).success;

export const isArrayFilter = (operator: Operator): operator is ArrayFilter => ArrayFilter.safeParse(operator).success;

export const isScalarFilter = (operator: Operator): operator is ScalarFilter =>
	ScalarFilter.safeParse(operator).success;

export const isGreaterThanFilter = (operator: Operator): operator is GreaterThanFilter =>
	GreaterThanFilter.safeParse(operator).success;

export const isLesserThanFilter = (operator: Operator): operator is LesserThanFilter =>
	LesserThanFilter.safeParse(operator).success;

const arrayFilterKeys: string[] = Object.values(ArrayFilterKeys);
export const isArrayFilterKey = (input: unknown): input is ArrayFilterKey =>
	typeof input === 'string' && arrayFilterKeys.includes(input);

const scalarFilterKeys: string[] = Object.values(ScalarFilterKeys);
export const isScalarFilterKey = (input: unknown): input is ScalarFilterKey =>
	typeof input === 'string' && scalarFilterKeys.includes(input);

export const isArrayFilterValue = (value: unknown): value is ArrayFilterValue =>
	ArrayFilterValue.safeParse(value).success;
export const isScalarFilterValue = (value: unknown): value is ScalarFilterValue =>
	ScalarFilterValue.safeParse(value).success;
