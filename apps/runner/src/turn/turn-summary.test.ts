import { expect, test } from 'bun:test';
import { turnSummary } from './turn-summary.ts';

const base = {
    activity: { operations: [] },
    endedAt: '2026-11-19T12:00:05.000Z',
    start: {
        agentId: 'agt_1',
        modelId: 'claude-opus-4-5',
        runId: 'run_1',
        runtimeId: 'claude-agent-sdk',
    },
    startedAt: '2026-11-19T12:00:00.000Z',
    visibleMessages: [],
};

test('a completed turn counts its sends and reports output', () => {
    expect(
        turnSummary({
            ...base,
            dispatched: true,
            result: { failure: null, status: 'completed', tokenUsage: null },
            sendCount: 2,
        })
    ).toEqual({
        activity: { operations: [] },
        agentId: 'agt_1',
        endedAt: '2026-11-19T12:00:05.000Z',
        messageCount: 2,
        modelId: 'claude-opus-4-5',
        outputProduced: true,
        runId: 'run_1',
        runtimeId: 'claude-agent-sdk',
        startedAt: '2026-11-19T12:00:00.000Z',
        status: 'completed',
        summary: 'Sent 2 message(s).',
        tokenUsage: null,
        type: 'turn',
        visibleMessages: [],
    });
});

test('an interrupted turn with no sends and no dispatches produced no output', () => {
    expect(
        turnSummary({
            ...base,
            dispatched: false,
            result: { failure: null, status: 'interrupted', tokenUsage: null },
            sendCount: 0,
        })
    ).toMatchObject({
        messageCount: 0,
        outputProduced: false,
        summary: 'The Agent turn was interrupted.',
    });
});

test('a failed turn that dispatched but sent nothing produced output, so its inbox is not requeued', () => {
    expect(
        turnSummary({
            ...base,
            dispatched: true,
            result: { failure: new Error('model refused'), status: 'failed', tokenUsage: null },
            sendCount: 0,
        })
    ).toMatchObject({
        messageCount: 0,
        outputProduced: true,
        status: 'failed',
        summary: 'The Agent turn did not complete.',
    });
});
