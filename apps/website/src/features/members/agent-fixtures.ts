import type { Agent } from '@haus/api';

/**
 * One live Agent, for tests that need a whole `Agent` to exercise something
 * else. Three suites used to carry their own full copy, so every field the
 * contract gained had to be pasted into each; they now name only what they
 * assert on.
 */
export function testAgent(overrides: Partial<Agent> = {}): Agent {
    return {
        availability: 'idle',
        avatarUrl: null,
        computerId: 'cmp_one',
        createdAt: '2026-07-29T12:00:00.000Z',
        createdByAgentId: null,
        createdByUserId: 'user_one',
        description: null,
        desiredModelId: 'model_one',
        desiredReasoningEffort: 'medium',
        desiredRuntimeId: 'runtime_one',
        displayName: 'Fen',
        dmChatId: null,
        effectiveModelId: 'model_one',
        effectiveReasoningEffort: 'medium',
        effectiveReportedAt: '2026-07-29T12:00:00.000Z',
        effectiveRuntimeId: 'runtime_one',
        factoryKind: 'ordinary',
        hausAgent: {
            appliedAt: '2026-07-29T12:00:00.000Z',
            appliedVersion: '1.0.0',
            currentVersion: '1.0.0',
            status: 'current',
        },
        handle: 'fen',
        id: 'agent_one',
        missingResources: [],
        serverId: 'server_one',
        status: 'applied',
        wakePause: null,
        ...overrides,
    };
}
