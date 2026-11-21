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

    expect(trace.traceparent).toBe(`00-${'a'.repeat(32)}-${trace.spanId}-01`);
    expect(trace.spanId).toMatch(/^[0-9a-f]{16}$/u);
    expect(trace.spanId).not.toBe('b'.repeat(16));
    expect(again.spanId).not.toBe(trace.spanId);
});

test('a turn without a dispatch starts its own trace, and an unsampled dispatch stays unsampled', () => {
    const root = openTurnTrace(undefined);
    const unsampled = openTurnTrace({ traceparent: `00-${'a'.repeat(32)}-${'b'.repeat(16)}-00` });

    expect(root.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/u);
    expect(root.traceparent.startsWith(`00-${'a'.repeat(32)}`)).toBe(false);
    expect(unsampled.traceparent).toBe(`00-${'a'.repeat(32)}-${unsampled.spanId}-00`);
});

test('the span frame carries ids, counts and timing from the settled summary and no trace', () => {
    const trace = openTurnTrace(dispatch);

    expect(
        turnSpanFrame({ serverId: 'srv_1', start: { chatId: 'chat_1' }, trace }, summary)
    ).toEqual({
        agentId: 'agt_1',
        chatId: 'chat_1',
        endedAtMs: Date.parse('2026-11-19T12:00:05.250Z'),
        messageCount: 1,
        modelId: 'claude-opus-4-5',
        outcome: 'completed',
        outputProduced: true,
        runId: 'run_1',
        runtimeId: 'claude-agent-sdk',
        serverId: 'srv_1',
        spanId: trace.spanId,
        startedAtMs: Date.parse('2026-11-19T12:00:00.000Z'),
        tokenUsage: summary.tokenUsage,
        type: 'runner-turn-span',
    });
});

test('a summary the span contract cannot carry yields no frame', () => {
    const run = { serverId: 'srv_1', start: { chatId: null }, trace: openTurnTrace(dispatch) };

    expect(turnSpanFrame(run, { ...summary, runId: 'r'.repeat(129) })).toBeNull();
    expect(turnSpanFrame(run, { ...summary, endedAt: '2026-11-19T11:59:59.000Z' })).toBeNull();
});
