import { expect, test } from 'bun:test';
import { rollupChecks, rollupReview } from './pull-request-read.ts';

const passed = { conclusion: 'success', status: 'completed' };

test('checks: a failure beats anything unfinished, and nothing at all is none', () => {
    const running = { conclusion: null, status: 'in_progress' };
    expect(rollupChecks([], [])).toBe('none');
    expect(rollupChecks([passed], [{ state: 'success' }])).toBe('passing');
    expect(rollupChecks([{ conclusion: 'skipped', status: 'completed' }], [])).toBe('passing');
    expect(rollupChecks([passed, running], [])).toBe('pending');
    expect(rollupChecks([passed], [{ state: 'pending' }])).toBe('pending');
    expect(rollupChecks([running, { conclusion: 'timed_out', status: 'completed' }], [])).toBe(
        'failing'
    );
    expect(rollupChecks([passed], [{ state: 'error' }])).toBe('failing');
});

test('reviews: each reviewer counts once, and changes requested beat approval', () => {
    const by = (id: number, state: string) => ({ state, user: { id } });
    expect(rollupReview([])).toBe('none');
    expect(rollupReview([by(1, 'COMMENTED')])).toBe('none');
    expect(rollupReview([by(1, 'APPROVED'), by(1, 'COMMENTED')])).toBe('approved');
    expect(rollupReview([by(1, 'CHANGES_REQUESTED'), by(1, 'APPROVED')])).toBe('approved');
    expect(rollupReview([by(1, 'APPROVED'), by(2, 'CHANGES_REQUESTED')])).toBe('changes-requested');
    expect(rollupReview([by(1, 'CHANGES_REQUESTED'), by(1, 'DISMISSED')])).toBe('none');
});
