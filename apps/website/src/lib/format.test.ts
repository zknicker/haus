import { describe, expect, it } from 'bun:test';
import { titleCase } from './format.ts';

describe('titleCase', () => {
	it('normalizes mixed-case input to proper title case', () => {
		expect(titleCase('hELLo-wORLD')).toBe('Hello World');
		expect(titleCase('fOO_bAR')).toBe('Foo Bar');
		expect(titleCase('aLREADY MiXeD')).toBe('Already Mixed');
	});

	it('returns empty string for empty and whitespace-only input', () => {
		expect(titleCase('')).toBe('');
		expect(titleCase('   ')).toBe('');
		expect(titleCase('---')).toBe('');
		expect(titleCase('___')).toBe('');
		expect(titleCase(' - _ ')).toBe('');
	});
});
