import { expect, test } from 'bun:test';
import { resolveTaskTier, stampsTaskTracked, type TaskTierRow } from './task-tier.ts';

const claimed: TaskTierRow = {
    messageId: 'msg_one',
    origin: 'claimed',
    status: 'in_progress',
    trackedAt: null,
};

test('an untouched Agent claim is background', () => {
    expect(resolveTaskTier(claimed)).toBe('background');
    expect(resolveTaskTier({ ...claimed, status: 'done' })).toBe('background');
});

test('a human-made task is always tracked', () => {
    expect(resolveTaskTier({ ...claimed, origin: 'composed' })).toBe('tracked');
    expect(resolveTaskTier({ ...claimed, origin: 'converted' })).toBe('tracked');
});

test('review and surviving a settled run are recorded as one stamp', () => {
    expect(resolveTaskTier({ ...claimed, trackedAt: new Date() })).toBe('tracked');
});

test('a claim parked outside its own lifecycle is tracked', () => {
    expect(resolveTaskTier({ ...claimed, status: 'todo' })).toBe('tracked');
    expect(resolveTaskTier({ ...claimed, status: 'in_review' })).toBe('tracked');
    expect(resolveTaskTier({ ...claimed, status: 'closed' })).toBe('tracked');
});

// A claim reopened to `todo` used to read tracked only while it sat there:
// moving it back to `in_progress` made it background again and it vanished
// from the Board. Every status outside the claim's own lifecycle persists the
// stamp, so the tier is one-way.
test('leaving the claim lifecycle is persisted, so the tier cannot flap back', () => {
    expect(stampsTaskTracked('todo')).toBe(true);
    expect(stampsTaskTracked('in_review')).toBe(true);
    expect(stampsTaskTracked('closed')).toBe(true);
    expect(stampsTaskTracked('in_progress')).toBe(false);
    expect(stampsTaskTracked('done')).toBe(false);
    expect(stampsTaskTracked(undefined)).toBe(false);
    for (const status of ['todo', 'in_review', 'closed'] as const) {
        const stamped = { ...claimed, status, trackedAt: new Date() };
        expect(resolveTaskTier(stamped)).toBe('tracked');
        expect(resolveTaskTier({ ...stamped, status: 'in_progress' })).toBe('tracked');
        expect(resolveTaskTier({ ...stamped, status: 'done' })).toBe('tracked');
    }
});
