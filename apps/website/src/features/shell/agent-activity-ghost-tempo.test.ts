import { expect, test } from 'bun:test';
import type { AgentCurrentActivity } from '@haus/api';
import { resolveAgentActivityGhostTempo } from './agent-activity-ghost-tempo.ts';

test('keeps the mark calm outside an activity provider', () => {
    expect(resolveAgentActivityGhostTempo(null)).toBe('calm');
});

test('keeps the mark calm until the activity snapshot settles', () => {
    expect(
        resolveAgentActivityGhostTempo({
            activities: [activity('agt_blippy')],
            isSnapshotReady: false,
        })
    ).toBe('calm');
});

test('keeps the mark calm on a settled quiet Server', () => {
    expect(resolveAgentActivityGhostTempo({ activities: [], isSnapshotReady: true })).toBe('calm');
});

test('quickens the mark while any Agent is working', () => {
    expect(
        resolveAgentActivityGhostTempo({
            activities: [activity('agt_blippy'), activity('agt_tiny')],
            isSnapshotReady: true,
        })
    ).toBe('lively');
});

function activity(agentId: string): AgentCurrentActivity {
    return {
        agentId,
        category: 'thinking',
        id: `aev_${agentId}`,
        occurredAt: '2026-08-14T12:00:00.000Z',
        runStartedAt: null,
        phase: 'started',
        position: 1,
        producer: 'server',
        producerId: 'server',
        producerSequence: 1,
        runId: `run_${agentId}`,
        serverId: 'srv_dev',
    };
}
