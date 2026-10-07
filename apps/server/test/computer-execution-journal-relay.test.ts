import { expect, test } from 'bun:test';
import type { AgentExecutionJournalResult, AgentExecutionOutlinesResult } from '@haus/api';
import { registerTestConnections } from './test-computer-connections.ts';

const computerId = 'cmp_1234567890123456';
const agentId = 'agt_1234567890123456';
const runId = 'run_1234567890123456';
const makeConnections = registerTestConnections();

test('execution journal relay is paired to the assigned Computer, Agent, and run', async () => {
    const frames: Record<string, unknown>[] = [];
    const connections = makeConnections();
    connections.register(computerId, {
        ordinary: true,
        send: (frame) => frames.push(frame as Record<string, unknown>),
        serverId: 'srv_1234567890123456',
        updatePhase: 'idle',
    });

    const pending = connections.requestExecutionJournal(computerId, {
        agentId,
        runId,
        serverId: 'srv_1234567890123456',
    });
    const requestId = String(frames[0]?.requestId);
    expect(frames[0]).toEqual({
        agentId,
        requestId,
        runId,
        type: 'agent-execution-journal-request',
    });
    const available: AgentExecutionJournalResult = {
        agentId,
        journal: {
            runId,
            startedAt: '2026-08-11T00:00:00.000Z',
            status: 'completed',
            tools: [],
        },
        requestId,
        runId,
        status: 'available',
        type: 'agent-execution-journal-result',
    };
    expect(connections.acceptExecutionJournalResult('cmp_0000000000000000', available)).toBe(false);
    expect(
        connections.acceptExecutionJournalResult(computerId, {
            ...available,
            agentId: 'agt_0000000000000000',
        })
    ).toBe(false);
    expect(connections.acceptExecutionJournalResult(computerId, available)).toBe(true);
    expect(await pending).toEqual(available);
});
test('execution journal detail is explicitly unavailable when its Computer is offline', async () => {
    const connections = makeConnections();
    await expect(
        connections.requestExecutionJournal('cmp_missing', {
            agentId,
            runId,
            serverId: 'srv_1234567890123456',
        })
    ).resolves.toMatchObject({
        reason: 'offline',
        runId,
        status: 'unavailable',
    });
});

test('execution journal relay refuses a Computer attached to another Server', async () => {
    const connections = makeConnections();
    connections.register(computerId, {
        ordinary: true,
        send: () => undefined,
        serverId: 'srv_1234567890123456',
        updatePhase: 'idle',
    });

    await expect(
        connections.requestExecutionJournal(computerId, {
            agentId,
            runId,
            serverId: 'srv_other123456789012',
        })
    ).resolves.toMatchObject({ reason: 'offline', status: 'unavailable' });
});

test('execution outlines relay answers many runs in one paired round trip', async () => {
    const frames: Record<string, unknown>[] = [];
    const connections = makeConnections();
    connections.register(computerId, {
        ordinary: true,
        send: (frame) => frames.push(frame as Record<string, unknown>),
        serverId: 'srv_1234567890123456',
        updatePhase: 'idle',
    });
    const runIds = [runId, 'run_0000000000000000'];
    const pending = connections.executionOutlines.request(computerId, {
        agentId,
        runIds,
        serverId: 'srv_1234567890123456',
    });
    expect(frames).toHaveLength(1);
    const requestId = String(frames[0]?.requestId);
    expect(frames[0]).toEqual({
        agentId,
        requestId,
        runIds,
        type: 'agent-execution-outlines-request',
    });
    const result: AgentExecutionOutlinesResult = {
        agentId,
        outlines: [
            {
                outline: {
                    durationMs: 1000,
                    runId,
                    startedAt: '2026-08-11T00:00:00.000Z',
                    status: 'completed',
                    steps: [],
                },
                runId,
                status: 'available',
            },
            { reason: 'missing', runId: 'run_0000000000000000', status: 'unavailable' },
        ],
        requestId,
        type: 'agent-execution-outlines-result',
    };
    // A foreign Computer, another Agent, or a reordered answer never settles the request.
    expect(connections.executionOutlines.accept('cmp_0000000000000000', result)).toBe(false);
    expect(
        connections.executionOutlines.accept(computerId, {
            ...result,
            agentId: 'agt_0000000000000000',
        })
    ).toBe(false);
    expect(
        connections.executionOutlines.accept(computerId, {
            ...result,
            outlines: [...result.outlines].reverse(),
        })
    ).toBe(false);
    expect(connections.executionOutlines.accept(computerId, result)).toBe(true);
    expect(await pending).toEqual({ outlines: result.outlines });
});

test('execution outlines settle every run as unavailable when the Computer drops', async () => {
    const connections = makeConnections();
    connections.register(computerId, {
        ordinary: true,
        send: () => undefined,
        serverId: 'srv_1234567890123456',
        updatePhase: 'idle',
    });
    const pending = connections.executionOutlines.request(computerId, {
        agentId,
        runIds: [runId],
        serverId: 'srv_1234567890123456',
    });
    connections.unregister(computerId);
    expect(await pending).toEqual({
        outlines: [{ reason: 'offline', runId, status: 'unavailable' }],
    });
    await expect(
        connections.executionOutlines.request(computerId, {
            agentId,
            runIds: [runId],
            serverId: 'srv_1234567890123456',
        })
    ).resolves.toEqual({ outlines: [{ reason: 'offline', runId, status: 'unavailable' }] });
});
