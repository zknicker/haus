import { expect, test } from 'bun:test';
import {
    type ActivityLogEntry,
    readLogDays,
    readOpenOnArrival,
    readStepMarks,
} from './agent-activity-log-entries.ts';
import { JournalQueue, LinkedHoverStore } from './agent-activity-log-stores.ts';
import type { AgentActivityTurn } from './agent-activity-turns.ts';

const tiny = { avatarUrl: null, displayName: 'Tiny', id: 'agt_tiny' };
const blippy = { avatarUrl: null, displayName: 'Blippy', id: 'agt_blippy' };

test('the log sorts newest first, groups by local day, and keeps only filtered Agents', () => {
    const today = new Date();
    const at = (daysAgo: number, hour: number) =>
        new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysAgo, hour);
    const days = readLogDays(
        [
            entry('run_old', at(1, 9)),
            entry('run_morning', at(0, 0)),
            entry('run_other', at(0, 0), blippy),
            entry('run_late', at(1, 22)),
            entry('run_new', at(0, 0).getTime() + 60_000),
        ],
        { agentIds: [tiny.id] }
    );
    expect(days.map((day) => day.label)).toEqual(['Today', 'Yesterday']);
    expect(days.map((day) => day.entries.map((item) => item.row.latest.runId))).toEqual([
        ['run_new', 'run_morning'],
        ['run_late', 'run_old'],
    ]);
});

test('only the newest day opens on arrival, at most ten turns of it', () => {
    const now = Date.now();
    const newest = Array.from({ length: 12 }, (_, index) =>
        entry(`run_${index}`, now - index * 60_000)
    );
    const days = [
        { entries: newest, key: 'today', label: 'Today' },
        { entries: [entry('run_yesterday', now - 86_400_000)], key: 'y', label: 'Yesterday' },
    ];
    const open = readOpenOnArrival(days);
    expect(open.size).toBe(10);
    expect(open.has('run_0')).toBe(true);
    expect(open.has('run_10')).toBe(false);
    expect(open.has('run_yesterday')).toBe(false);
    expect(readOpenOnArrival([]).size).toBe(0);
});

test('step marks are fractions of the turn axis, toned as their rows', () => {
    const marks = readStepMarks(
        [
            {
                kind: 'call',
                status: 'completed',
                timing: { durationMs: 500, offsetMs: 0 },
                tool: { isBookkeeping: true },
            },
            {
                kind: 'call',
                status: 'failed',
                timing: { durationMs: 2000, offsetMs: 1000 },
                tool: { isBookkeeping: false },
            },
            { kind: 'event', timing: { durationMs: null, offsetMs: 0 } },
        ] as never,
        4000
    );
    expect(marks).toEqual([
        { kind: 'quiet', start: 0, status: 'completed', width: 0.125 },
        { kind: 'tool', start: 0.25, status: 'failed', width: 0.5 },
    ]);
    expect(readStepMarks([], 0)).toEqual([]);
});

test('journal reads are admitted at most three at a time, in request order', () => {
    const queue = new JournalQueue();
    let notified = 0;
    queue.subscribe(() => {
        notified += 1;
    });
    for (const runId of ['a', 'b', 'c', 'd', 'e']) {
        queue.request(runId);
    }
    expect(['a', 'b', 'c', 'd', 'e'].map((runId) => queue.isAdmitted(runId))).toEqual([
        true,
        true,
        true,
        false,
        false,
    ]);
    // A repeat request neither queues twice nor re-admits.
    queue.request('a');
    queue.settle('b');
    expect(queue.isAdmitted('d')).toBe(true);
    expect(queue.isAdmitted('e')).toBe(false);
    // Settling an unknown or already-settled read admits nothing more.
    queue.settle('b');
    queue.settle('zzz');
    expect(queue.isAdmitted('e')).toBe(false);
    queue.settle('a');
    expect(queue.isAdmitted('e')).toBe(true);
    // Settled reads stay admitted: reopening a turn keeps its trace.
    expect(queue.isAdmitted('b')).toBe(true);
    expect(notified).toBe(5);
});

test('linked hover notifies only when the pointed turn or span changes', () => {
    const store = new LinkedHoverStore();
    let notified = 0;
    store.subscribe(() => {
        notified += 1;
    });
    store.set({ runId: 'run_a', source: 'overview', span: null });
    store.set({ runId: 'run_a', source: 'overview', span: null });
    expect(notified).toBe(1);
    store.set({ runId: 'run_a', source: 'row', span: { start: 0.1, width: 0.2 } });
    store.set({ runId: 'run_a', source: 'row', span: { start: 0.1, width: 0.2 } });
    expect(notified).toBe(2);
    expect(store.get()).toEqual({
        runId: 'run_a',
        source: 'row',
        span: { start: 0.1, width: 0.2 },
    });
    store.set(null);
    store.set(null);
    expect(notified).toBe(3);
    expect(store.get()).toBeNull();
});

function entry(
    runId: string,
    startedAt: Date | number,
    agent: ActivityLogEntry['agent'] = tiny
): ActivityLogEntry {
    const iso = new Date(startedAt).toISOString();
    const turn = {
        durationMs: 60_000,
        endedAt: iso,
        events: [],
        failureKind: null,
        kind: 'settled',
        messageCount: 1,
        operationCount: 0,
        operations: [],
        outputProduced: true,
        runId,
        startedAt: iso,
        status: 'completed',
        trigger: null,
    } satisfies AgentActivityTurn;
    return { agent, row: { count: 1, latest: turn, since: iso }, title: { kind: 'none' } };
}
