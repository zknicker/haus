import { expect, test } from 'bun:test';
import type { Agent, AgentLifecycleEvent } from '@haus/api';
import { projectAgentAvailability } from './use-agent-lifecycle.ts';

const agent = {
    availability: 'idle',
    id: 'agt_test',
} as Agent;

const base = {
    agentId: agent.id,
    chatId: 'cht_test',
    emittedAt: '2026-07-29T12:00:00.000Z',
    runId: 'run_test',
    serverId: 'srv_test',
} as const;

test('active lifecycle phases immediately project a working Agent', () => {
    const event = { ...base, phase: 'reading' } satisfies AgentLifecycleEvent;
    expect(projectAgentAvailability([agent], event)[0]?.availability).toBe('working');
});

test.each([
    ['completed', 'idle'],
    ['failed', 'error'],
    ['stopped', 'stopped'],
] as const)('settled %s lifecycle projects %s availability', (outcome, availability) => {
    const event = {
        ...base,
        outcome,
        phase: 'settled',
    } satisfies AgentLifecycleEvent;
    expect(projectAgentAvailability([agent], event)[0]?.availability).toBe(availability);
});
