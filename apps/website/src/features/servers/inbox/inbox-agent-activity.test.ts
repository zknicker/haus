import { describe, expect, test } from 'bun:test';
import type { Agent, AgentLifecycleEvent } from '@haus/api';
import type { CurrentAgentActivity } from '../../../hooks/agents/current-agent-activity.ts';
import { currentAgentActivityLabels, happeningNowAgentRows } from './inbox-agent-activity.ts';

const now = Date.parse('2025-05-08T15:03:00.000Z');
const noLifecycles = new Map<string, AgentLifecycleEvent>();

function activity(overrides: Partial<CurrentAgentActivity> = {}): CurrentAgentActivity {
    return {
        agentId: 'agt_blippy',
        category: 'editing_files',
        id: 'act_1',
        occurredAt: '2025-05-08T15:00:00.000Z',
        runStartedAt: '2025-05-08T15:00:00.000Z',
        phase: 'started',
        position: 1,
        producer: 'computer',
        producerId: 'prd_1',
        producerSequence: 1,
        runId: 'run_1',
        serverId: 'srv_1',
        ...overrides,
    };
}

function settledLifecycle(runId: string): AgentLifecycleEvent {
    return {
        agentId: 'agt_blippy',
        chatId: 'cht_1',
        emittedAt: '2025-05-08T15:02:00.000Z',
        outcome: 'completed',
        phase: 'settled',
        runId,
        serverId: 'srv_1',
    };
}

function workingLifecycle(runId: string): AgentLifecycleEvent {
    return {
        agentId: 'agt_blippy',
        chatId: 'cht_1',
        emittedAt: '2025-05-08T15:02:00.000Z',
        phase: 'working',
        runId,
        serverId: 'srv_1',
    };
}

describe('happeningNowAgentRows', () => {
    test('step transitions keep total elapsed time and tick in seconds past a minute', () => {
        const step = activity({ occurredAt: '2025-05-08T15:02:59.000Z' });
        expect(happeningNowAgentRows([step], noLifecycles, [], now)[0]?.label).toBe(
            'Editing files · 3m 0s elapsed'
        );
        expect(
            happeningNowAgentRows(
                [{ ...step, category: 'working' }],
                noLifecycles,
                [],
                now + 1000
            )[0]?.label
        ).toBe('Working · 3m 1s elapsed');
    });

    test('missing turn timing does not substitute the current step timestamp', () => {
        expect(
            happeningNowAgentRows([activity({ runStartedAt: null })], noLifecycles, [], now)[0]
                ?.label
        ).toBe('Editing files…');
    });

    test('shows the safe tool name when available', () => {
        expect(
            happeningNowAgentRows(
                [activity({ category: 'using_tool', toolRef: 'browser' })],
                noLifecycles,
                [],
                now
            )[0]?.label
        ).toBe('Using browser · 3m 0s elapsed');
        expect(
            happeningNowAgentRows([activity({ category: 'using_tool' })], noLifecycles, [], now)[0]
                ?.label
        ).toBe('Using a tool · 3m 0s elapsed');
    });

    test('states the current step and total turn duration', () => {
        const [row] = happeningNowAgentRows([activity()], noLifecycles, [], now);
        expect(row?.label).toBe('Editing files · 3m 0s elapsed');
    });

    test('names the Agent when the roster knows it, and its id tail when it does not', () => {
        const agent = { displayName: 'Blippy', id: 'agt_blippy' } as Agent;
        expect(happeningNowAgentRows([activity()], noLifecycles, [agent], now)[0]?.name).toBe(
            'Blippy'
        );
        expect(happeningNowAgentRows([activity()], noLifecycles, [], now)[0]?.name).toBe(
            'Agent blippy'
        );
    });

    test('a newer run’s lifecycle drops the previous run’s step', () => {
        const lifecycles = new Map([['agt_blippy', workingLifecycle('run_2')]]);
        expect(happeningNowAgentRows([activity()], lifecycles, [], now)).toEqual([]);
    });

    test('a settled lifecycle leaves the row to the availability filter', () => {
        const lifecycles = new Map([['agt_blippy', settledLifecycle('run_1')]]);
        expect(happeningNowAgentRows([activity()], lifecycles, [], now)).toHaveLength(1);
    });
});

describe('currentAgentActivityLabels', () => {
    test('gives each Agent its step, without the elapsed clause a row carries', () => {
        const labels = currentAgentActivityLabels([activity()], noLifecycles);
        expect(labels.get('agt_blippy')).toBe('Editing files…');
    });

    test('filters by lifecycle the same way the rows do', () => {
        const lifecycles = new Map([['agt_blippy', workingLifecycle('run_2')]]);
        expect(currentAgentActivityLabels([activity()], lifecycles).size).toBe(0);
    });
});
