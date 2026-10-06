import { expect, test } from 'bun:test';
import type { AgentActivityEvent, AgentTurn } from '@haus/api';
import {
    formatActivityTurnCounts,
    formatActivityTurnHeadline,
    groupAgentActivityTurns,
} from './agent-activity-turns.ts';

test('groups raw history into an exact settled turn summary', () => {
    const turns = groupAgentActivityTurns(
        [
            activityEvent({ category: 'working', phase: 'completed', position: 5 }),
            activityEvent({ category: 'sending_message', phase: 'completed', position: 4 }),
            activityEvent({ category: 'using_tool', phase: 'completed', position: 3 }),
            activityEvent({ category: 'using_tool', phase: 'started', position: 2 }),
            activityEvent({ position: 1 }),
        ],
        [settledTurn()]
    );

    expect(turns).toHaveLength(1);
    expect(turns[0]).toMatchObject({
        durationMs: 65_000,
        kind: 'settled',
        messageCount: 1,
        operationCount: 1,
        status: 'completed',
    });
    expect(formatActivityTurnHeadline(turns[0]!)).toBe('Completed in 1m 5s');
    expect(formatActivityTurnCounts(turns[0]!)).toBe('1 tool call · 1 message');
});

test('makes silent completion and active work explicit', () => {
    const silent = groupAgentActivityTurns(
        [
            activityEvent({ category: 'working', phase: 'completed', position: 2 }),
            activityEvent({ position: 1 }),
        ],
        [settledTurn({ messageCount: 0, outputProduced: false })]
    )[0]!;
    const active = groupAgentActivityTurns(
        [activityEvent()],
        [],
        Date.parse('2026-08-11T12:00:09Z')
    )[0]!;

    expect(formatActivityTurnHeadline(silent)).toBe('Completed silently in 1m 5s');
    expect(formatActivityTurnHeadline(active)).toBe('Working for 9s');
});

test('renders a durable interrupted turn when granular frames were not retained', () => {
    const [turn] = groupAgentActivityTurns(
        [],
        [
            settledTurn({
                activity: {
                    operations: [
                        {
                            category: 'running_command',
                            completed: 1,
                            failed: 0,
                            interrupted: 1,
                        },
                    ],
                },
                messageCount: 0,
                outputProduced: false,
                status: 'interrupted',
            }),
        ]
    );

    expect(formatActivityTurnHeadline(turn!)).toBe('Interrupted after 1m 5s');
    expect(formatActivityTurnCounts(turn!)).toBe('2 commands (1 interrupted) · 0 messages');
});

function activityEvent(overrides: Partial<AgentActivityEvent> = {}): AgentActivityEvent {
    return {
        agentId: 'agent_one',
        category: 'working',
        id: `event_${overrides.position ?? 1}`,
        occurredAt: '2026-08-11T12:00:00.000Z',
        phase: 'started',
        position: 1,
        producer: 'server',
        producerId: 'server_one',
        producerSequence: overrides.position ?? 1,
        runId: 'run_one',
        serverId: 'server_one',
        ...overrides,
    };
}

function settledTurn(overrides: Partial<AgentTurn> = {}): AgentTurn {
    return {
        activity: {
            operations: [
                {
                    category: 'using_tool',
                    completed: 1,
                    failed: 0,
                    interrupted: 0,
                },
            ],
        },
        agentId: 'agent_one',
        endedAt: '2026-08-11T12:01:05.000Z',
        failureKind: null,
        messageCount: 1,
        outputProduced: true,
        runId: 'run_one',
        startedAt: '2026-08-11T12:00:00.000Z',
        status: 'completed',
        summary: null,
        trigger: null,
        ...overrides,
    };
}
