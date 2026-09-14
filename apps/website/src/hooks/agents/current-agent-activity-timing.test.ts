import { expect, test } from 'bun:test';
import type { AgentActivityEvent } from '@haus/api';
import { projectAgentCurrentActivity } from '@haus/api/agent-activity';
import {
    mergeCurrentAgentActivityLiveEvent,
    reconcileCurrentAgentActivity,
} from './current-agent-activity.ts';

const start: AgentActivityEvent = {
    agentId: 'agt_one',
    category: 'starting_work',
    id: 'aev_start',
    occurredAt: '2026-09-14T12:00:00.000Z',
    phase: 'started',
    position: 1,
    producer: 'server',
    producerId: 'server',
    producerSequence: 1,
    runId: 'run_one',
    serverId: 'srv_one',
};
const tool: AgentActivityEvent = {
    ...start,
    category: 'using_tool',
    occurredAt: '2026-09-14T12:00:30.000Z',
    position: 2,
    producer: 'computer',
    toolRef: 'browser',
};
const completed: AgentActivityEvent = { ...tool, phase: 'completed', position: 3 };

test('snapshot replay and compacted live steps preserve the same turn start', () => {
    const snapshot = projectAgentCurrentActivity(projectAgentCurrentActivity(null, start), tool);
    expect(snapshot).not.toBeNull();
    if (!snapshot) {
        throw new Error('Expected active turn');
    }
    let overlay = mergeCurrentAgentActivityLiveEvent(undefined, start);
    overlay = mergeCurrentAgentActivityLiveEvent(overlay, tool);
    overlay = mergeCurrentAgentActivityLiveEvent(overlay, completed);
    const live = reconcileCurrentAgentActivity([], [overlay.event]);
    const reloaded = reconcileCurrentAgentActivity([snapshot], [overlay.event]);
    expect(live).toEqual(reloaded);
    expect(live[0]).toMatchObject({ category: 'working', runStartedAt: start.occurredAt });
    expect(projectAgentCurrentActivity(snapshot, completed)).toEqual(live[0]);
});

test('joining mid-turn recovers timing from the snapshot without inventing a step start', () => {
    const overlay = mergeCurrentAgentActivityLiveEvent(undefined, tool);
    expect(overlay.event.runStartedAt).toBeNull();
    const snapshot = projectAgentCurrentActivity(null, start);
    expect(snapshot).not.toBeNull();
    expect(
        reconcileCurrentAgentActivity(snapshot ? [snapshot] : [], [overlay.event])[0]
    ).toMatchObject({ category: 'using_tool', runStartedAt: start.occurredAt });
});

test('a new turn gets its own clock and settlement clears the Server projection', () => {
    const previous = projectAgentCurrentActivity(null, start);
    const next = { ...start, runId: 'run_two', occurredAt: '2026-09-14T13:00:00.000Z' };
    const current = projectAgentCurrentActivity(previous, next);
    expect(current?.runStartedAt).toBe(next.occurredAt);
    expect(
        projectAgentCurrentActivity(current, {
            ...next,
            category: 'working',
            phase: 'completed',
            position: 2,
        })
    ).toBeNull();
});

test('work after a committed message retains the turn clock in the live overlay', () => {
    const started = mergeCurrentAgentActivityLiveEvent(undefined, start);
    const finishing = mergeCurrentAgentActivityLiveEvent(started, {
        ...start,
        category: 'sending_message',
        phase: 'completed',
        position: 2,
    });
    const resumed = mergeCurrentAgentActivityLiveEvent(finishing, { ...tool, position: 3 });
    expect(resumed.event).toMatchObject({ category: 'using_tool', runStartedAt: start.occurredAt });
});
