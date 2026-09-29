import { expect, test } from 'bun:test';
import { type StalledClaimTask, selectStalledClaims } from './stalled-claims.ts';

function claim(overrides: Partial<StalledClaimTask> & { id: string }) {
    return {
        live: false,
        origin: 'claimed' as const,
        status: 'in_progress' as const,
        tier: 'tracked' as const,
        ...overrides,
    };
}

test('surfaces a tracked claim whose run settled without finishing', () => {
    expect(selectStalledClaims([claim({ id: 'stopped' })]).map((item) => item.id)).toEqual([
        'stopped',
    ]);
});

test('says nothing about a claim somebody is still working', () => {
    expect(selectStalledClaims([claim({ id: 'running', live: true })])).toEqual([]);
});

test('says nothing about finished or reviewed work', () => {
    const items = [
        claim({ id: 'done', status: 'done' }),
        claim({ id: 'in-review', status: 'in_review' }),
        claim({ id: 'closed', status: 'closed' }),
    ];

    expect(selectStalledClaims(items)).toEqual([]);
});

test('leaves background bookkeeping and human-made tasks alone', () => {
    const items = [
        claim({ id: 'bookkeeping', tier: 'background' }),
        claim({ id: 'composed', origin: 'composed' }),
        claim({ id: 'converted', origin: 'converted' }),
    ];

    expect(selectStalledClaims(items)).toEqual([]);
});
