import { expect, test } from 'bun:test';
import {
    AGENT_ACTIVE_DELEGATIONS_MAX,
    type AgentActivityEvent,
    type AgentCurrentActivity,
    agentActivityFrameSchema,
    agentCurrentActivitySchema,
    agentTurnActivitySummarySchema,
    projectAgentCurrentActivity,
} from './agent-activity.ts';

const first = 'a'.repeat(32);
const second = 'b'.repeat(32);

const base = {
    agentId: 'agt_one',
    occurredAt: '2026-10-06T12:00:00.000Z',
    producer: 'computer',
    producerId: 'cmp_one',
    runId: 'run_one',
    serverId: 'srv_one',
} as const;

let position = 0;
function event(
    category: AgentActivityEvent['category'],
    phase: AgentActivityEvent['phase'],
    extra: Partial<AgentActivityEvent> = {}
): AgentActivityEvent {
    position += 1;
    return {
        ...base,
        category,
        id: `aev_${String(position)}`,
        phase,
        position,
        producerSequence: position,
        ...extra,
    };
}

test('a delegating frame carries an opaque hex operation id and counts as a sub-agent', () => {
    const frame = {
        agentId: 'agt_one',
        category: 'delegating',
        occurredAt: base.occurredAt,
        operationId: first,
        phase: 'started',
        producerSequence: 1,
        runId: 'run_one',
        type: 'agent-activity',
    } as const;
    expect(agentActivityFrameSchema.parse(frame)).toEqual(frame);
    for (const operationId of ['toolu_01SHKppRQNKB4vvqqaiv26WK', 'abc', 'A'.repeat(32)]) {
        expect(agentActivityFrameSchema.safeParse({ ...frame, operationId }).success).toBe(false);
    }
    expect(
        agentTurnActivitySummarySchema.safeParse({
            operations: [{ category: 'delegating', completed: 1, failed: 0, interrupted: 0 }],
        }).success
    ).toBe(true);
});

test('current activity tracks running sub-agents until each settles', () => {
    const one = event('delegating', 'started', { operationId: first });
    const two = event('delegating', 'started', {
        occurredAt: '2026-10-06T12:00:05.000Z',
        operationId: second,
    });
    const reading = event('reading_files', 'started');
    const readDone = event('reading_files', 'completed');
    const oneDone = event('delegating', 'completed', { operationId: first });
    const twoDone = event('delegating', 'interrupted', { operationId: second });

    const states: AgentCurrentActivity[] = [];
    for (const next of [one, two, reading, readDone, oneDone, twoDone]) {
        const projected = projectAgentCurrentActivity(states.at(-1) ?? null, next);
        if (!projected) {
            throw new Error('The run left current activity.');
        }
        states.push(agentCurrentActivitySchema.parse(projected));
    }

    const running = [
        { operationId: first, startedAt: base.occurredAt },
        { operationId: second, startedAt: '2026-10-06T12:00:05.000Z' },
    ];
    expect(states.map((state) => state.category)).toEqual([
        'delegating',
        'delegating',
        'reading_files',
        // A settled step falls back to the sub-agents still running.
        'delegating',
        'delegating',
        'working',
    ]);
    expect(states[1]?.activeDelegations).toEqual(running);
    expect(states[3]?.activeDelegations).toEqual(running);
    expect(states[4]?.activeDelegations).toEqual(running.slice(1));
    expect(states[5]).not.toHaveProperty('activeDelegations');
});

test('a snapshot carries its delegations and a terminal turn clears them', () => {
    const snapshot = agentCurrentActivitySchema.parse({
        ...event('delegating', 'started', { operationId: first }),
        activeDelegations: [{ operationId: first, startedAt: base.occurredAt }],
        runStartedAt: base.occurredAt,
    });
    expect(projectAgentCurrentActivity(null, snapshot)).toEqual(snapshot);
    expect(
        projectAgentCurrentActivity(
            snapshot,
            event('working', 'completed', { producer: 'server', producerId: 'server' })
        )
    ).toBeNull();
});

test('the snapshot lists at most sixteen running sub-agents', () => {
    let current: AgentCurrentActivity | null = null;
    for (let index = 0; index <= AGENT_ACTIVE_DELEGATIONS_MAX; index += 1) {
        current = projectAgentCurrentActivity(
            current,
            event('delegating', 'started', { operationId: index.toString(16).padStart(16, '0') })
        );
    }
    expect(current?.activeDelegations).toHaveLength(AGENT_ACTIVE_DELEGATIONS_MAX);
    expect(agentCurrentActivitySchema.safeParse(current).success).toBe(true);
});
