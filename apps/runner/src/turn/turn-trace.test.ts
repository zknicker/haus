import { expect, test } from 'bun:test';
import { turnSummary } from './turn-summary.ts';
import { openTurnTrace, turnSpanFrame } from './turn-trace.ts';

const dispatch = { traceparent: `00-${'a'.repeat(32)}-${'b'.repeat(16)}-01` };

const summary = turnSummary({
    activity: { operations: [] },
    dispatched: false,
    endedAt: '2026-11-19T12:00:05.250Z',
    result: {
        failure: null,
        status: 'completed',
        tokenUsage: {
            cacheReadTokens: 3,
            cacheWriteTokens: 4,
            inputTokens: 1,
            outputTokens: 2,
            totalTokens: 10,
        },
    },
    sendCount: 1,
    start: {
        agentId: 'agt_1',
        modelId: 'claude-opus-4-5',
        runId: 'run_1',
        runtimeId: 'claude-agent-sdk',
    },
    startedAt: '2026-11-19T12:00:00.000Z',
    visibleMessages: [{ chatId: 'chat_1', id: 'msg_private', sequence: 4 }],
});

test('a turn under a dispatch continues its trace as a new child span', () => {
    const trace = openTurnTrace(dispatch);
    const again = openTurnTrace(dispatch);

    expect(trace).toMatchObject({ parentSpanId: 'b'.repeat(16), sampled: true });
    expect(trace.traceId).toBe('a'.repeat(32));
    expect(trace.traceparent).toBe(`00-${'a'.repeat(32)}-${trace.spanId}-01`);
    expect(trace.spanId).toMatch(/^[0-9a-f]{16}$/u);
    expect(again.spanId).not.toBe(trace.spanId);
});

test('a turn without a dispatch starts its own trace, and an unsampled dispatch stays unsampled', () => {
    const root = openTurnTrace(undefined);
    const unsampled = openTurnTrace({ traceparent: `00-${'a'.repeat(32)}-${'b'.repeat(16)}-00` });

    expect(root.parentSpanId).toBeUndefined();
    expect(root.traceId).toMatch(/^[0-9a-f]{32}$/u);
    expect(root.traceId).not.toBe('a'.repeat(32));
    expect(unsampled.sampled).toBe(false);
    expect(unsampled.traceparent.endsWith('-00')).toBe(true);
});

test('the span frame carries ids, counts and timing from the settled summary and nothing else', () => {
    const trace = openTurnTrace(dispatch);

    expect(turnSpanFrame(trace, { chatId: 'chat_1' }, summary)).toEqual({
        agentId: 'agt_1',
        chatId: 'chat_1',
        endedAtMs: Date.parse('2026-11-19T12:00:05.250Z'),
        messageCount: 1,
        modelId: 'claude-opus-4-5',
        outcome: 'completed',
        outputProduced: true,
        parentSpanId: 'b'.repeat(16),
        runId: 'run_1',
        runtimeId: 'claude-agent-sdk',
        sampled: true,
        spanId: trace.spanId,
        startedAtMs: Date.parse('2026-11-19T12:00:00.000Z'),
        tokenUsage: summary.tokenUsage,
        traceId: 'a'.repeat(32),
        type: 'runner-turn-span',
    });
});

test('a summary the span contract cannot carry yields no frame', () => {
    const trace = openTurnTrace(dispatch);

    const start = { chatId: null };

    expect(turnSpanFrame(trace, start, { ...summary, runId: 'r'.repeat(129) })).toBeNull();
    expect(
        turnSpanFrame(trace, start, { ...summary, endedAt: '2026-11-19T11:59:59.000Z' })
    ).toBeNull();
});
