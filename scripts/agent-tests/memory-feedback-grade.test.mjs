import { expect, test } from 'bun:test';
import { gradeRule, standingPreferences } from './memory-feedback-grade.mjs';

test('reads Standing Preferences lines without bullets', () => {
    const memory =
        '# A\n\n## Standing Preferences\n\n- Use metric units.\n- High agency.\n\n## Active Context\n\n- None.\n';
    expect(standingPreferences(memory)).toEqual(['Use metric units.', 'High agency.']);
});

test('passes a terse imperative rule', () => {
    expect(gradeRule('Take routine next steps without asking first.')).toEqual([]);
});

test('flags deltas, compound rules, and sourced records', () => {
    expect(gradeRule('Be tighter; do routine next steps without asking.')).toEqual([
        'compound: two rules in one line',
        'delta: "tighter"',
    ]);
    expect(gradeRule('Lead with the answer (reinforced by @dana).')).toEqual([
        'sourced: "reinforc"',
    ]);
});
