import { expect, test } from 'bun:test';
import type { AgentActivityTurn } from './agent-activity-turns.ts';
import { collapseRecentActivity } from './recent-activity-rows.ts';

type SettledTurn = Extract<AgentActivityTurn, { kind: 'settled' }>;

test('consecutive identical failures fold into one row that reads since its first', () => {
    const rows = collapseRecentActivity(
        [
            failed('r5', '2026-10-01T16:50:00Z'),
            failed('r4', '2026-10-01T16:45:00Z'),
            failed('r3', '2026-10-01T16:40:00Z'),
            completed('r2', '2026-10-01T16:35:00Z'),
            failed('r1', '2026-10-01T16:33:00Z'),
        ],
        5
    );
    expect(rows.map((row) => [row.latest.runId, row.count, row.since])).toEqual([
        ['r5', 3, '2026-10-01T16:40:00Z'],
        ['r2', 1, '2026-10-01T16:35:00Z'],
        ['r1', 1, '2026-10-01T16:33:00Z'],
    ]);
});

test('different failure kinds and completed repeats stay separate rows', () => {
    const rows = collapseRecentActivity(
        [
            failed('r4', '2026-10-01T16:50:00Z', 'timeout'),
            failed('r3', '2026-10-01T16:45:00Z', 'auth'),
            completed('r2', '2026-10-01T16:40:00Z'),
            completed('r1', '2026-10-01T16:35:00Z'),
        ],
        5
    );
    expect(rows.map((row) => row.count)).toEqual([1, 1, 1, 1]);
});

test('the limit counts rows, so a folded run still leaves room for older turns', () => {
    const rows = collapseRecentActivity(
        [
            failed('r4', '2026-10-01T16:50:00Z'),
            failed('r3', '2026-10-01T16:45:00Z'),
            completed('r2', '2026-10-01T16:40:00Z'),
            completed('r1', '2026-10-01T16:35:00Z'),
        ],
        2
    );
    expect(rows.map((row) => row.latest.runId)).toEqual(['r4', 'r2']);
});

test('the same failure on different requests stays separate rows', () => {
    const rows = collapseRecentActivity(
        [
            { ...failed('r2', '2026-10-01T16:50:00Z'), trigger: messageTrigger('msg_b') },
            { ...failed('r1', '2026-10-01T16:45:00Z'), trigger: messageTrigger('msg_a') },
        ],
        5
    );
    expect(rows.map((row) => row.count)).toEqual([1, 1]);
});

function messageTrigger(messageId: string): AgentActivityTurn['trigger'] {
    return { author: 'human', chatId: 'cht_one', kind: 'message', messageId };
}

function failed(runId: string, startedAt: string, failureKind = 'runtime'): AgentActivityTurn {
    return { ...settled(runId, startedAt), failureKind, status: 'failed' };
}

function completed(runId: string, startedAt: string): AgentActivityTurn {
    return settled(runId, startedAt);
}

function settled(runId: string, startedAt: string): SettledTurn {
    return {
        durationMs: 120_000,
        endedAt: startedAt,
        events: [],
        failureKind: null,
        kind: 'settled',
        messageCount: 0,
        operationCount: 0,
        operations: [],
        outputProduced: true,
        runId,
        startedAt,
        status: 'completed',
        trigger: null,
    };
}
