import { expect, test } from 'bun:test';
import { type ClaimTierRow, resolveClaimTier, stampsClaimTracked } from './claim-tier.ts';

const claimed: ClaimTierRow = {
    messageId: 'msg_one',
    origin: 'claimed',
    status: 'in_progress',
    trackedAt: null,
};

test('an untouched Agent claim is background', () => {
    expect(resolveClaimTier(claimed)).toBe('background');
    expect(resolveClaimTier({ ...claimed, status: 'done' })).toBe('background');
});

test('a human-made claim is always tracked', () => {
    expect(resolveClaimTier({ ...claimed, origin: 'composed' })).toBe('tracked');
    expect(resolveClaimTier({ ...claimed, origin: 'converted' })).toBe('tracked');
});

test('review and surviving a settled run are recorded as one stamp', () => {
    expect(resolveClaimTier({ ...claimed, trackedAt: new Date() })).toBe('tracked');
});

test('a claim parked outside its own lifecycle is tracked', () => {
    expect(resolveClaimTier({ ...claimed, status: 'todo' })).toBe('tracked');
    expect(resolveClaimTier({ ...claimed, status: 'in_review' })).toBe('tracked');
    expect(resolveClaimTier({ ...claimed, status: 'closed' })).toBe('tracked');
});

// A claim reopened to `todo` used to read tracked only while it sat there:
// moving it back to `in_progress` made it background again and it vanished
// from the Board. Every status outside the claim's own lifecycle persists the
// stamp, so the tier is one-way.
test('leaving the claim lifecycle is persisted, so the tier cannot flap back', () => {
    expect(stampsClaimTracked('todo')).toBe(true);
    expect(stampsClaimTracked('in_review')).toBe(true);
    expect(stampsClaimTracked('closed')).toBe(true);
    expect(stampsClaimTracked('in_progress')).toBe(false);
    expect(stampsClaimTracked('done')).toBe(false);
    expect(stampsClaimTracked(undefined)).toBe(false);
    for (const status of ['todo', 'in_review', 'closed'] as const) {
        const stamped = { ...claimed, status, trackedAt: new Date() };
        expect(resolveClaimTier(stamped)).toBe('tracked');
        expect(resolveClaimTier({ ...stamped, status: 'in_progress' })).toBe('tracked');
        expect(resolveClaimTier({ ...stamped, status: 'done' })).toBe('tracked');
    }
});
