import { expect, test } from 'bun:test';
import type { WorkerReport, WorkerTurnInput } from '@haus/api';
import {
    canFollowUpWorker,
    newestWorkerReport,
    workerCardLine,
    workerStatusText,
} from './worker-card-model.ts';
import { workerTurnFixture as turn, workerFixture as work } from './worker-fixture.ts';

const now = Date.parse('2026-09-04T12:04:00.000Z');
const names: Record<string, string> = { agt_one: 'Forge', usr_zach: 'Zach' };
const name = (author: WorkerTurnInput['author']) => names[author.id] ?? author.id;
const line = (worker: ReturnType<typeof work>) => workerCardLine(worker, { name, now });

const doneReport: WorkerReport = {
    ask: null,
    messageId: 'msg_report',
    outcome: 'done',
    personId: null,
    personRefused: null,
    pullRequestUrls: [],
    source: 'worker',
    text: 'Fixed the migration.',
};

const followUp: WorkerTurnInput = {
    at: '2026-09-04T12:02:00.000Z',
    author: { id: 'usr_zach', kind: 'user' },
    kind: 'follow-up',
    messageId: 'msg_follow_up',
    text: 'Match iPhone.',
};

test('the newest report survives a later follow-up turn that has not reported yet', () => {
    const worker = work({
        turns: [
            turn({ input: [followUp], status: 'running', turnId: 'wkt_two' }),
            turn({ outcome: { kind: 'report', report: doneReport }, turnId: 'wkt_one' }),
        ],
    });

    expect(newestWorkerReport(worker)?.text).toBe('Fixed the migration.');
    expect(line(worker)).toEqual({ text: "On Zach's follow-up", tone: 'muted' });
});

test('a settled report speaks for itself, so the card has no status line', () => {
    const worker = work({
        turns: [turn({ outcome: { kind: 'report', report: doneReport } })],
    });

    expect(line(worker)).toBeNull();
});

test('an unreported failure states its reason as danger', () => {
    const worker = work({
        turns: [
            turn({
                outcome: { detail: null, kind: 'failed', reason: 'no-report' },
                status: 'failed',
            }),
        ],
    });

    expect(line(worker)).toEqual({ text: 'Ended without a report', tone: 'danger' });
});

test('a follow-up queued behind the working turn says it goes in next', () => {
    const worker = work({
        turns: [
            turn({ input: [followUp], status: 'queued', turnId: 'wkt_two' }),
            turn({ status: 'running', turnId: 'wkt_one' }),
        ],
        updatedAt: '2026-09-04T12:03:00.000Z',
    });

    expect(line(worker)).toEqual({ text: "Zach's follow-up goes in next", tone: 'muted' });
});

test('a lone queued turn waits for a slot, and a quiet working turn warns', () => {
    expect(line(work({ status: 'queued', updatedAt: '2026-09-04T12:03:00.000Z' }))).toEqual({
        text: 'Waiting for a free slot',
        tone: 'muted',
    });
    expect(line(work({ updatedAt: '2026-09-04T11:50:00.000Z' }))).toEqual({
        text: 'No update in 14m',
        tone: 'warning',
    });
});

test('a requested stop reads Stopping on the chip and the line until the turn settles', () => {
    const stopping = work({
        stopRequestedAt: '2026-09-04T12:03:00.000Z',
        updatedAt: '2026-09-04T12:03:00.000Z',
    });

    expect(workerStatusText(stopping)).toBe('Stopping');
    expect(line(stopping)).toEqual({ text: 'Stopping', tone: 'muted' });

    const stopped = work({
        turns: [
            turn({
                outcome: { kind: 'stopped' },
                status: 'cancelled',
                stopRequestedBy: { id: 'usr_zach', kind: 'user' },
                terminalAt: '2026-09-04T11:54:00.000Z',
            }),
        ],
    });

    expect(workerStatusText(stopped)).toBe('Stopped');
    expect(line(stopped)?.text).toBe('Stopped by Zach 10m ago');
});

test('only an open Worker on a Task takes follow-ups', () => {
    expect(canFollowUpWorker(work())).toBe(true);
    expect(canFollowUpWorker(work({ closingAt: '2026-09-04T12:03:00.000Z' }))).toBe(false);
    expect(canFollowUpWorker(work({ closedAt: '2026-09-04T12:03:00.000Z' }))).toBe(false);
    expect(canFollowUpWorker(work({ taskId: null }))).toBe(false);
});
