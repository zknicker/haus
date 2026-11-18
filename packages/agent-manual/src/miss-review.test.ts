import { expect, test } from 'bun:test';
import { type ManualLookupRecord, unresolvedManualLookups } from './miss-review.ts';

const record = (operation: 'get' | 'search', lookup: string): ManualLookupRecord => ({
    agent: 'agt_forge',
    at: '2026-10-01T12:00:00Z',
    intent: 'Find tools for checking MerchBase sales.',
    lookup,
    operation,
    reason: 'The owner asked for yesterday’s sales.',
});

test('miss review keeps only lookups the current corpus still cannot answer', () => {
    const records = [
        record('search', 'cloud agent model'),
        record('search', 'cursor'),
        record('get', 'reminders'),
        record('get', 'merchbase'),
        record('search', 'merchbase sales tools'),
    ];

    expect(unresolvedManualLookups(records).map(({ lookup }) => lookup)).toEqual([
        'merchbase',
        'merchbase sales tools',
    ]);
});
