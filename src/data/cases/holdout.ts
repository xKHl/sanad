import { CaseSchema, type SyntheticCase } from './schema';

/**
 * Held-out cases (SPEC §13.3). Written after the rules were frozen, by a different author, and
 * never used to tune the rules. Misses are reported in docs/EVALUATION.md, not fixed silently.
 * Empty until the cases are added; the evaluation reports the held-out column as "pending".
 */
const RAW: SyntheticCase[] = [];

export const HOLDOUT_CASES: SyntheticCase[] = RAW.map((c) => CaseSchema.parse(c));
