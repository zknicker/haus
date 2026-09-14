import { expect, test } from 'bun:test';
import {
    agentActivityCategorySchema,
    agentActivityEventSchema,
    agentActivityFrameSchema,
    agentTurnActivitySummarySchema,
    projectAgentCurrentActivity,
} from './agent-activity.ts';

const frame = {
    agentId: 'agt_one',
    category: 'using_tool',
    occurredAt: '2026-08-11T12:00:00.000Z',
    phase: 'started',
    producerSequence: 1,
    runId: 'run_one',
    type: 'agent-activity',
} as const;

test('activity categories are the safe semantic vocabulary', () => {
    expect(agentActivityCategorySchema.safeParse('running_command').success).toBe(true);
    expect(agentActivityCategorySchema.safeParse('updating_instructions').success).toBe(true);
    expect(agentActivityCategorySchema.safeParse('drafting').success).toBe(false);
});

test('turn activity summaries retain only exact low-cardinality operation counts', () => {
    expect(
        agentTurnActivitySummarySchema.parse({
            operations: [
                {
                    category: 'running_command',
                    completed: 2,
                    failed: 1,
                    interrupted: 0,
                },
            ],
        })
    ).toEqual({
        operations: [{ category: 'running_command', completed: 2, failed: 1, interrupted: 0 }],
    });
    expect(
        agentTurnActivitySummarySchema.safeParse({
            operations: [
                {
                    category: 'thinking',
                    completed: 1,
                    failed: 0,
                    interrupted: 0,
                },
            ],
        }).success
    ).toBe(false);
    expect(
        agentTurnActivitySummarySchema.safeParse({
            operations: [
                { category: 'using_tool', completed: 1, failed: 0, interrupted: 0 },
                { category: 'using_tool', completed: 0, failed: 1, interrupted: 0 },
            ],
        }).success
    ).toBe(false);
});

test('Computer frames reject detailed evidence and Server identity fields', () => {
    expect(agentActivityFrameSchema.parse(frame)).toEqual(frame);
    expect(
        agentActivityFrameSchema.safeParse({
            ...frame,
            command: 'cat private.txt',
        }).success
    ).toBe(false);
    expect(
        agentActivityFrameSchema.safeParse({
            ...frame,
            serverId: 'srv_wrong',
        }).success
    ).toBe(false);
});

test('committed events add Server identity and presentation position', () => {
    expect(
        agentActivityEventSchema.parse({
            agentId: frame.agentId,
            category: frame.category,
            occurredAt: frame.occurredAt,
            phase: frame.phase,
            producerSequence: frame.producerSequence,
            runId: frame.runId,
            id: 'aev_one',
            position: 3,
            producer: 'computer',
            producerId: 'cmp_one',
            serverId: 'srv_one',
        })
    ).toMatchObject({ position: 3, producer: 'computer', serverId: 'srv_one' });
});

test('current activity finishes after a committed message until the turn settles', () => {
    const event = agentActivityEventSchema.parse({
        agentId: frame.agentId,
        category: 'running_command',
        occurredAt: frame.occurredAt,
        phase: 'started',
        producerSequence: frame.producerSequence,
        runId: frame.runId,
        id: 'aev_started',
        position: 1,
        producer: 'computer',
        producerId: 'cmp_one',
        serverId: 'srv_one',
    });
    const committedMessage = {
        ...event,
        category: 'sending_message' as const,
        id: 'aev_message',
        phase: 'completed' as const,
        position: 2,
        producer: 'server' as const,
        producerId: 'server',
    };
    const lateCompletion = {
        ...event,
        id: 'aev_completed',
        phase: 'completed' as const,
        position: 3,
        producerSequence: 2,
    };
    const nextOperation = {
        ...event,
        category: 'thinking' as const,
        id: 'aev_thinking',
        position: 4,
        producerSequence: 3,
    };
    const settled = {
        ...event,
        category: 'working' as const,
        id: 'aev_settled',
        phase: 'completed' as const,
        position: 5,
        producer: 'server' as const,
        producerId: 'server',
    };

    const started = projectAgentCurrentActivity(null, event);
    const afterMessage = projectAgentCurrentActivity(started, committedMessage);

    expect(afterMessage).toEqual({ ...committedMessage, runStartedAt: null });
    expect(projectAgentCurrentActivity(afterMessage, lateCompletion)).toEqual({
        ...committedMessage,
        runStartedAt: null,
    });
    expect(projectAgentCurrentActivity(afterMessage, nextOperation)).toEqual({
        ...nextOperation,
        runStartedAt: null,
    });
    expect(projectAgentCurrentActivity(afterMessage, settled)).toBeNull();
});
