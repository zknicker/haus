import { expect, test } from 'bun:test';
import {
    type ActivityLogEntry,
    readLogDays,
    readOpenOnArrival,
    readOutlineMarks,
    readStepMarks,
} from './agent-activity-log-entries.ts';
import { JournalQueue, LinkedHoverStore, StepMarksStore } from './agent-activity-log-stores.ts';
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

test('quiet days remain visible before and between loaded activity', () => {
    const now = new Date(2026, 9, 7, 16).getTime();
    const days = readLogDays(
        [entry('oct_5', new Date(2026, 9, 5, 22)), entry('oct_2', new Date(2026, 9, 2, 10))],
        { agentIds: [tiny.id] },
        now
    );
    expect(days.map((day) => day.label)).toEqual([
        'Today',
        'Yesterday',
        'Oct 5',
        'Oct 4',
        'Oct 3',
        'Oct 2',
    ]);
    expect(days.map((day) => day.entries.length)).toEqual([0, 0, 1, 0, 0, 1]);
    expect([...readOpenOnArrival(days)]).toEqual(['oct_5']);
});

test('empty and fully filtered logs still show today', () => {
    const now = new Date(2026, 9, 7, 16).getTime();
    for (const entries of [[], [entry('other', new Date(2026, 9, 2, 10), blippy)]]) {
        expect(readLogDays(entries, { agentIds: [tiny.id] }, now)).toEqual([
            { entries: [], key: '2026-9-7', label: 'Today' },
        ]);
    }
});

test('calendar stepping keeps every local day across a daylight saving transition', () => {
    const days = readLogDays(
        [entry('before_dst', new Date(2026, 2, 7, 23))],
        { agentIds: [tiny.id] },
        new Date(2026, 2, 9, 12).getTime()
    );
    expect(days.map((day) => day.key)).toEqual(['2026-2-9', '2026-2-8', '2026-2-7']);
    expect(days.map((day) => day.entries.length)).toEqual([0, 0, 1]);
});

test('step marks are fractions of the turn axis, toned as their rows', () => {
    const marks = readStepMarks(
        [
            {
                kind: 'call',
                status: 'completed',
                timing: { durationMs: 500, offsetMs: 0 },
                tool: { isBookkeeping: true, kind: 'shell' },
            },
            {
                kind: 'call',
                status: 'failed',
                timing: { durationMs: 2000, offsetMs: 1000 },
                tool: { isBookkeeping: false, kind: 'shell' },
            },
            {
                kind: 'fold',
                status: 'completed',
                timing: { durationMs: 1000, offsetMs: 3000 },
                toolKind: 'file-read',
            },
            { kind: 'event', timing: { durationMs: null, offsetMs: 0 } },
        ] as never,
        4000
    );
    expect(marks).toEqual([
        { kind: 'haus', start: 0, status: 'completed', width: 0.125 },
        { kind: 'shell', start: 0.25, status: 'failed', width: 0.5 },
        { kind: 'file', start: 0.75, status: 'completed', width: 0.25 },
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

test('an outline draws top-level marks on the turn axis, toned by kind like a read trace', () => {
    const marks = readOutlineMarks(
        {
            durationMs: 8000,
            runId: 'run_outline',
            startedAt: '2026-10-01T10:00:00.000Z',
            status: 'completed',
            steps: [
                {
                    depth: 0,
                    durationMs: 1000,
                    id: 'r',
                    kind: 'reasoning',
                    label: 'Reasoning',
                    startOffsetMs: 0,
                    status: 'completed',
                },
                {
                    depth: 0,
                    durationMs: 500,
                    id: 'h',
                    kind: 'bookkeeping',
                    label: 'haus',
                    startOffsetMs: 1000,
                    status: 'completed',
                },
                {
                    depth: 0,
                    durationMs: 4000,
                    id: 's',
                    kind: 'subagent',
                    label: 'delegate',
                    startOffsetMs: 2000,
                    status: 'completed',
                    subagent: { failedToolCount: 2, label: 'Survey' },
                },
                {
                    depth: 1,
                    durationMs: 100,
                    id: 'c',
                    kind: 'tool',
                    label: 'read a.ts',
                    parentId: 's',
                    startOffsetMs: 2500,
                    status: 'failed',
                    toolKind: 'file-read',
                },
                {
                    depth: 0,
                    id: 'f',
                    kind: 'tool',
                    label: 'bash',
                    startOffsetMs: 6000,
                    status: 'failed',
                    toolKind: 'shell',
                },
                ...(['web', 'image', 'file-edit', 'mcp', 'generic'] as const).map(
                    (toolKind, index) => ({
                        depth: 0,
                        durationMs: 100,
                        id: `k${index}`,
                        kind: 'tool' as const,
                        label: toolKind,
                        startOffsetMs: 7000 + index * 100,
                        status: 'completed' as const,
                        toolKind,
                    })
                ),
            ],
        },
        10_000
    );
    expect(marks).toEqual([
        { kind: 'thinking', start: 0, status: 'completed', width: 0.1 },
        { kind: 'haus', start: 0.1, status: 'completed', width: 0.05 },
        { kind: 'subagent', start: 0.2, status: 'warning', width: 0.4 },
        { kind: 'shell', start: 0.6, status: 'failed', width: 0 },
        { kind: 'web', start: 0.7, status: 'completed', width: 0.01 },
        { kind: 'media', start: 0.71, status: 'completed', width: 0.01 },
        { kind: 'file', start: 0.72, status: 'completed', width: 0.01 },
        // An MCP or unrecognized call keeps the general tool hue, as in a read trace.
        { kind: 'tool', start: 0.73, status: 'completed', width: 0.01 },
        { kind: 'tool', start: 0.74, status: 'completed', width: 0.01 },
    ]);
});

test("a read journal's marks win over its outline", () => {
    const store = new StepMarksStore();
    const outline = [{ kind: 'tool', start: 0, status: 'completed', width: 1 }] as const;
    const journal = [{ kind: 'thinking', start: 0, status: 'completed', width: 0.5 }] as const;
    store.setOutline('run_a', outline);
    expect(store.get('run_a')).toBe(outline);
    store.set('run_a', journal);
    store.setOutline('run_a', [...outline]);
    expect(store.get('run_a')).toBe(journal);
});
