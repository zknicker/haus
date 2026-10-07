import { expect, test } from 'bun:test';
import type { AgentCurrentActivity, AgentTurn } from '@haus/api';
import {
    type ActivityLogEntry,
    readLogDays,
} from '../../members/agent-profile/agent-activity-log-entries.ts';
import { readServerActivityGroups } from './server-activity-turns.ts';

const blippy = { avatarUrl: null, displayName: 'Blippy', id: 'agt_blippy' };
const tiny = { avatarUrl: null, displayName: 'Tiny', id: 'agt_tiny' };
const now = Date.parse('2026-10-07T15:00:00.000Z');

test('interleaves every Agent newest first and adds each working run', () => {
    const groups = readServerActivityGroups({
        agents: [blippy, tiny],
        current: [
            current('agt_tiny', 'run_tiny_live', '2026-10-07T14:59:00.000Z'),
            // Settled between the two reads: the settled turn wins.
            current('agt_blippy', 'run_blippy_2', '2026-10-07T14:10:00.000Z'),
        ],
        now,
        settled: [
            settled('agt_blippy', 'run_blippy_2', '2026-10-07T14:10:00.000Z'),
            settled('agt_tiny', 'run_tiny_1', '2026-10-07T14:05:00.000Z'),
            settled('agt_blippy', 'run_blippy_1', '2026-10-07T14:00:00.000Z'),
            settled('agt_gone', 'run_gone_1', '2026-10-07T14:20:00.000Z'),
        ],
    });
    expect(groups.map((group) => [group.agent.id, group.turns.map((turn) => turn.kind)])).toEqual([
        ['agt_blippy', ['settled', 'settled']],
        ['agt_tiny', ['active', 'settled']],
    ]);

    const entries = groups.flatMap(({ agent, turns }) =>
        turns.map(
            (turn): ActivityLogEntry => ({
                agent,
                row: { count: 1, latest: turn, since: turn.startedAt },
                title: { kind: 'pending', place: null },
            })
        )
    );
    const order = (agentIds: string[]) =>
        readLogDays(entries, { agentIds }).flatMap((day) =>
            day.entries.map((entry) => entry.row.latest.runId)
        );
    expect(order(['agt_blippy', 'agt_tiny'])).toEqual([
        'run_tiny_live',
        'run_blippy_2',
        'run_tiny_1',
        'run_blippy_1',
    ]);
    expect(order(['agt_tiny'])).toEqual(['run_tiny_live', 'run_tiny_1']);
});

test('a working run starts at its recorded run start', () => {
    const [group] = readServerActivityGroups({
        agents: [tiny],
        current: [current('agt_tiny', 'run_tiny_live', '2026-10-07T14:58:00.000Z')],
        now,
        settled: [],
    });
    expect(group?.turns[0]).toMatchObject({
        durationMs: 120_000,
        kind: 'active',
        startedAt: '2026-10-07T14:58:00.000Z',
    });
});

function settled(agentId: string, runId: string, startedAt: string): AgentTurn {
    return {
        activity: { operations: [] },
        agentId,
        endedAt: new Date(Date.parse(startedAt) + 60_000).toISOString(),
        failureKind: null,
        messageCount: 1,
        outputProduced: true,
        runId,
        startedAt,
        status: 'completed',
        summary: null,
        trigger: null,
    };
}

function current(agentId: string, runId: string, runStartedAt: string): AgentCurrentActivity {
    return {
        agentId,
        category: 'thinking',
        id: `aev_${runId}`,
        occurredAt: '2026-10-07T14:59:30.000Z',
        phase: 'started',
        position: 2,
        producer: 'computer',
        producerId: 'cmp_one',
        producerSequence: 1,
        runId,
        runStartedAt,
        serverId: 'srv_one',
    };
}
