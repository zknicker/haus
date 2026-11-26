import { describe, expect, test } from 'bun:test';
import type { ConfiguredAgentRow } from '../src/server-agents/agent-shape.ts';
import { deriveAgentAvailability, deriveAgentStatus } from '../src/server-agents/agent-shape.ts';

const base: ConfiguredAgentRow = {
    activeRunId: null,
    avatarId: null,
    computerHealth: 'healthy',
    computerId: 'cmp_1234567890123456',
    consecutiveFailures: 0,
    createdAt: new Date('2026-07-28T00:00:00Z'),
    createdByUserId: null,
    description: null,
    desiredModelId: 'gpt-5.6-sol',
    desiredReasoningEffort: 'medium',
    desiredRuntimeId: 'codex',
    displayName: 'Cove',
    captainChatId: null,
    effectiveBackgroundSubagents: 0,
    effectiveMissing: [],
    effectiveModelId: 'gpt-5.6-sol',
    effectiveReasoningEffort: 'medium',
    effectiveReportedAt: new Date('2026-07-28T00:00:00Z'),
    effectiveRuntimeId: 'codex',
    handle: 'sage',
    id: 'agt_1234567890123456',
    modelConnectionId: null,
    lastFailureAt: null,
    lastFailureCode: null,
    lastFailureKind: null,
    pausedAt: null,
    retryAfter: null,
    serverId: 'srv_1234567890123456',
    stopped: false,
};

describe('Agent availability', () => {
    test('an Agent runs on the runner, so its assigned Computer being offline does not change it', () => {
        expect(deriveAgentAvailability({ ...base, computerHealth: 'offline' })).toBe('idle');
        expect(
            deriveAgentAvailability({ ...base, activeRunId: 'run_123', computerHealth: 'offline' })
        ).toBe('working');
    });

    test('projects working, stopped, error, and idle from Server-owned facts', () => {
        expect(deriveAgentAvailability({ ...base, activeRunId: 'run_123' })).toBe('working');
        expect(deriveAgentAvailability({ ...base, stopped: true })).toBe('stopped');
        expect(deriveAgentAvailability({ ...base, consecutiveFailures: 1 })).toBe('error');
        // A wake pause stays `error`; the pause detail rides `wakePause`.
        expect(
            deriveAgentAvailability({ ...base, consecutiveFailures: 3, pausedAt: new Date() })
        ).toBe('error');
        expect(deriveAgentAvailability(base)).toBe('idle');
    });
});

describe('Agent configuration status', () => {
    test('stays pending while the applied reasoning effort differs from desired state', () => {
        expect(
            deriveAgentStatus({
                ...base,
                desiredReasoningEffort: 'high',
            })
        ).toBe('pending');
    });
});
