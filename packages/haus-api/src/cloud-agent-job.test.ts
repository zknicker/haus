import { describe, expect, test } from 'bun:test';
import { deriveCloudAgentJob } from './cloud-agent-job.ts';
import type { CloudAgentStatus } from './cloud-agent-shared.ts';

const queuedAt = '2026-09-04T13:00:00.000Z';
const startedAt = '2026-09-04T12:00:30.000Z';
const settledAt = '2026-09-04T12:20:00.000Z';

function run(
    status: CloudAgentStatus,
    overrides: Partial<Parameters<typeof deriveCloudAgentJob>[0]['runs'][number]> = {}
) {
    const settled = ['completed', 'failed', 'cancelled', 'expired'].includes(status);
    return {
        createdAt: '2026-09-04T12:00:00.000Z',
        errorCode: null,
        // A queued Run here is still in Haus's local queue; every other one reached Cursor.
        providerRunId: status === 'queued' ? null : 'run-cursor',
        startedAt: status === 'queued' ? null : startedAt,
        status,
        summary: null,
        terminalAt: settled ? settledAt : null,
        ...overrides,
    };
}

function job(...runs: ReturnType<typeof run>[]) {
    const [newest] = runs;
    return deriveCloudAgentJob({
        runs,
        startedAt: newest?.startedAt ?? null,
        status: newest?.status ?? 'queued',
        terminalAt: newest?.terminalAt ?? null,
    });
}

describe('deriveCloudAgentJob', () => {
    test('a first Run still in the queue is working, never queued', () => {
        expect(job(run('queued'))).toEqual({ followUp: null, startedAt: null, state: 'working' });
    });

    test('a running first Run is working since it started', () => {
        expect(job(run('running'))).toEqual({ followUp: null, startedAt, state: 'working' });
    });

    test('a follow-up queued behind a finished Run leaves the job done and waiting', () => {
        expect(job(run('queued', { createdAt: queuedAt }), run('completed'))).toEqual({
            followUp: { since: queuedAt, state: 'waiting' },
            settledAt,
            startedAt,
            state: 'done',
        });
    });

    test('a follow-up queued while the earlier Run is still going reads working', () => {
        expect(job(run('queued', { createdAt: queuedAt }), run('running'))).toEqual({
            followUp: { since: queuedAt, state: 'waiting' },
            startedAt,
            state: 'working',
        });
    });

    test('a follow-up queued behind a failed Run keeps the failure', () => {
        expect(
            job(
                run('queued', { createdAt: queuedAt }),
                run('failed', { errorCode: 'build_failed', summary: 'Tests failed.' })
            )
        ).toEqual({
            errorCode: 'build_failed',
            followUp: { since: queuedAt, state: 'waiting' },
            settledAt,
            state: 'failed',
            summary: 'Tests failed.',
        });
    });

    test('a running follow-up is working and dated from its own start', () => {
        const followUpStart = '2026-09-04T13:01:00.000Z';
        expect(
            job(run('running', { createdAt: queuedAt, startedAt: followUpStart }), run('completed'))
        ).toEqual({
            followUp: { since: followUpStart, state: 'running' },
            startedAt: followUpStart,
            state: 'working',
        });
    });

    test('a settled follow-up is the job, with no follow-up left', () => {
        expect(job(run('completed'), run('failed'))).toMatchObject({
            followUp: null,
            state: 'done',
        });
    });

    test('a cancelled or expired Run reads in Cursor’s own words', () => {
        expect(job(run('cancelled'))).toEqual({ followUp: null, settledAt, state: 'cancelled' });
        expect(job(run('expired'))).toEqual({ followUp: null, settledAt, state: 'expired' });
    });

    test('a follow-up cancelled before Cursor received it leaves the job done', () => {
        expect(job(run('cancelled', { providerRunId: null }), run('completed'))).toEqual({
            followUp: null,
            settledAt,
            startedAt,
            state: 'done',
        });
    });

    test('a follow-up that failed after Cursor received it is the failed job', () => {
        expect(job(run('failed'), run('completed'))).toMatchObject({
            followUp: null,
            state: 'failed',
        });
    });

    test('a first Run that failed before Cursor received it is failed, with no follow-up', () => {
        expect(job(run('failed', { providerRunId: null }))).toMatchObject({
            followUp: null,
            state: 'failed',
        });
    });

    test('a follow-up cancelled after Cursor received it is the job', () => {
        expect(job(run('cancelled'), run('completed'))).toEqual({
            followUp: null,
            settledAt,
            state: 'cancelled',
        });
    });

    test('a follow-up Cursor received but still queues reads working', () => {
        expect(
            job(run('queued', { createdAt: queuedAt, providerRunId: 'run-2' }), run('completed'))
        ).toEqual({
            followUp: { since: queuedAt, state: 'waiting' },
            startedAt: null,
            state: 'working',
        });
    });

    test('a first Run cancelled before Cursor received it is cancelled', () => {
        expect(job(run('cancelled', { providerRunId: null }))).toMatchObject({
            state: 'cancelled',
        });
    });

    test('a work with no Run reads from its own lifecycle', () => {
        expect(
            deriveCloudAgentJob({ runs: [], startedAt: null, status: 'queued', terminalAt: null })
        ).toEqual({ followUp: null, startedAt: null, state: 'working' });
    });
});
