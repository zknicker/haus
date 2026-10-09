import { expect, test } from 'bun:test';
import type { CloudAgentWork } from '@haus/api';
import { cloudAgentStatusLine } from './cloud-agent-status-line.ts';
import {
    cloudAgentRunFixture as run,
    cloudAgentWorkFixture as work,
} from './cloud-agent-work-fixture.ts';

const now = Date.parse('2026-09-04T12:10:00.000Z');
const minutesAgo = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
const line = (value: CloudAgentWork) => cloudAgentStatusLine(value, { agentName: 'Blippy', now });

/** A follow-up queued 3 minutes ago behind an earlier Run. */
function followedUp(earlier: Parameters<typeof run>[0], overrides: Partial<CloudAgentWork> = {}) {
    return work({
        runs: [
            run({ createdAt: minutesAgo(3), runId: 'car_two', status: 'queued' }),
            run({ terminalAt: minutesAgo(5), ...earlier }),
        ],
        startedAt: null,
        status: 'queued',
        updatedAt: minutesAgo(3),
        ...overrides,
    });
}

test('a working job shows its latest activity as one flat line', () => {
    expect(
        line(
            work({
                activity: { at: minutesAgo(1), summary: '### Now\nReading `migrations/003.sql`' },
                updatedAt: minutesAgo(1),
            })
        )
    ).toEqual({ text: 'Now Reading migrations/003.sql', tone: 'muted' });
});

test('a working job with no activity says when it last updated', () => {
    expect(line(work({ updatedAt: minutesAgo(4) }))).toEqual({
        text: 'Updated 4m ago',
        tone: 'muted',
    });
});

test('a follow-up behind a finished Run keeps the job done and notes the wait', () => {
    const value = followedUp({ status: 'completed' });

    expect(value.job.state).toBe('done');
    expect(line(value)).toEqual({ text: 'Blippy asked for changes · waiting 3m', tone: 'muted' });
});

test('a follow-up queued while the earlier Run still goes reads working', () => {
    const value = followedUp({ status: 'running', terminalAt: null });

    expect(value.job.state).toBe('working');
    expect(line(value).text).toBe('Blippy asked for changes · waiting 3m');
});

test('a running follow-up says how long it has run', () => {
    const value = work({
        runs: [
            run({ runId: 'car_two', startedAt: minutesAgo(2), status: 'running' }),
            run({ status: 'completed' }),
        ],
        updatedAt: minutesAgo(1),
    });

    expect(line(value).text).toBe('Blippy asked for changes · running 2m');
});

test('a follow-up behind a failed Run keeps the failure, and the failure wins the line', () => {
    const value = followedUp({
        errorCode: 'sample_build_failed',
        status: 'failed',
        summary: 'The **build** failed.',
    });

    expect(value.job.state).toBe('failed');
    expect(line(value)).toEqual({ text: 'The build failed.', tone: 'danger' });
});

test('a failure without a report reads its error code', () => {
    expect(
        line(work({ runs: [run({ errorCode: 'sample_build_failed', status: 'failed' })] })).text
    ).toBe('Sample build failed');
});

test('a quiet live Run warns, ahead of the follow-up note', () => {
    const value = followedUp({ status: 'completed' }, { updatedAt: minutesAgo(52) });

    expect(line(value)).toEqual({ text: 'No update in 52m', tone: 'warning' });
});

test('a requested stop shows until the Run settles', () => {
    expect(line(work({ cancelRequestedAt: minutesAgo(2), updatedAt: minutesAgo(1) }))).toEqual({
        text: 'Stopping · requested 2m ago',
        tone: 'muted',
    });
});

test('settled jobs say when they settled', () => {
    expect(
        line(work({ runs: [run({ status: 'completed', terminalAt: minutesAgo(30) })] })).text
    ).toBe('Finished 30m ago');
    expect(
        line(work({ runs: [run({ status: 'cancelled', terminalAt: minutesAgo(30) })] })).text
    ).toBe('Cancelled · 30m ago');
    expect(
        line(work({ runs: [run({ status: 'expired', terminalAt: minutesAgo(30) })] })).text
    ).toBe('Expired · 30m ago');
});

test('every job state has a status line', () => {
    for (const status of [
        'queued',
        'running',
        'completed',
        'failed',
        'cancelled',
        'expired',
    ] as const) {
        expect(line(work({ status, updatedAt: minutesAgo(1) })).text.length).toBeGreaterThan(0);
    }
});
