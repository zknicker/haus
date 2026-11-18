import { expect, test } from 'bun:test';
import type { AgentActivityEvent } from '@haus/api';
import {
    type CurrentAgentActivity,
    mergeCurrentAgentActivityLiveEvent,
    reconcileCurrentAgentActivity,
} from './current-agent-activity.ts';

const base: AgentActivityEvent = {
    agentId: 'agt_one',
    category: 'delegating',
    id: 'aev_1',
    occurredAt: '2026-10-06T12:00:10.000Z',
    operationId: 'op_a',
    phase: 'started',
    position: 5,
    producer: 'computer',
    producerId: 'cmp_one',
    producerSequence: 5,
    runId: 'run_one',
    serverId: 'srv_one',
};
const snapshot: CurrentAgentActivity = {
    ...base,
    activeDelegations: [
        { operationId: 'op_a', startedAt: '2026-10-06T12:00:10.000Z' },
        { operationId: 'op_b', startedAt: '2026-10-06T12:00:11.000Z' },
    ],
    runStartedAt: '2026-10-06T12:00:00.000Z',
};

test('a live overlay that began mid-run keeps the snapshot sub-agents it never saw start', () => {
    const overlay = mergeCurrentAgentActivityLiveEvent(undefined, {
        ...base,
        category: 'reading_files',
        id: 'aev_2',
        operationId: undefined,
        position: 6,
    });
    const [current] = reconcileCurrentAgentActivity([snapshot], [overlay]);
    expect(current?.activeDelegations?.map((delegation) => delegation.operationId)).toEqual([
        'op_a',
        'op_b',
    ]);
});

test('a sub-agent the overlay saw settle leaves the inherited list', () => {
    const overlay = mergeCurrentAgentActivityLiveEvent(undefined, {
        ...base,
        id: 'aev_2',
        phase: 'completed',
        position: 6,
    });
    expect(overlay.settledOperationIds).toEqual(['op_a']);
    const [current] = reconcileCurrentAgentActivity([snapshot], [overlay]);
    expect(current?.activeDelegations?.map((delegation) => delegation.operationId)).toEqual([
        'op_b',
    ]);
    expect(current?.category).toBe('delegating');
});

test('a newer run never inherits an older run’s sub-agents', () => {
    const overlay = mergeCurrentAgentActivityLiveEvent(undefined, {
        ...base,
        category: 'thinking',
        id: 'aev_3',
        operationId: undefined,
        position: 1,
        runId: 'run_two',
    });
    const [current] = reconcileCurrentAgentActivity([snapshot], [overlay]);
    expect(current?.runId).toBe('run_two');
    expect(current?.activeDelegations).toBeUndefined();
});
