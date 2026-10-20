import { expect, test } from 'bun:test';
import { aiSdkTurnEvents } from './ai-sdk-turn-events.ts';

test('every typed part yields at least one event, untyped parts none', () => {
    expect(aiSdkTurnEvents({ type: 'start-step' })).toEqual([
        { nativeType: 'start-step', type: 'progress' },
    ]);
    expect(aiSdkTurnEvents({ rawValue: { sessionUpdate: 'usage_update' }, type: 'raw' })).toEqual([
        { nativeType: 'raw', type: 'progress' },
    ]);
    expect(aiSdkTurnEvents(null)).toEqual([]);
    expect(aiSdkTurnEvents({ text: 'x' })).toEqual([]);
});

test('raw runtime payloads become typed events', () => {
    const failure = {
        category: 'access',
        severity: 'warning' as const,
        title: 'Reconnecting... 1/5',
    };
    expect(
        aiSdkTurnEvents({
            rawValue: { _meta: { jetbrains: { air: { sessionFailure: failure } } } },
            type: 'raw',
        })
    ).toEqual([{ ...failure, type: 'session-failure' }]);
    expect(
        aiSdkTurnEvents({
            rawValue: {
                kind: 'read',
                locations: [{ path: '/w/a.txt' }],
                sessionUpdate: 'tool_call',
                toolCallId: 'call_read',
            },
            type: 'raw',
        })
    ).toEqual([{ path: '/w/a.txt', toolCallId: 'call_read', type: 'tool-read-location' }]);
    expect(
        aiSdkTurnEvents({
            rawValue: {
                subtype: 'task_started',
                task_id: 't1',
                task_type: 'local_agent',
                tool_use_id: 'toolu_1',
                type: 'system',
            },
            type: 'raw',
        })
    ).toEqual([{ taskId: 't1', toolCallId: 'toolu_1', type: 'subagent-started' }]);
});

test('tool parts keep their facts and an ACP source call', () => {
    expect(
        aiSdkTurnEvents({
            dynamic: true,
            input: { path: 'a.txt' },
            providerExecuted: true,
            providerMetadata: { acp: { toolCallId: 'call_patch' } },
            toolCallId: 'call_fc',
            toolName: 'fileChange',
            type: 'tool-call',
        })
    ).toEqual([
        {
            dynamic: true,
            input: { path: 'a.txt' },
            providerExecuted: true,
            sourceToolCallId: 'call_patch',
            toolCallId: 'call_fc',
            toolName: 'fileChange',
            type: 'tool-call',
        },
    ]);
});

test('usage parts settle into token usage and context size', () => {
    const usage = {
        inputTokenDetails: { cacheReadTokens: 8, cacheWriteTokens: 2 },
        inputTokens: 100,
        outputTokens: 20,
    };
    const tokens = {
        cacheReadTokens: 8,
        cacheWriteTokens: 2,
        inputTokens: 100,
        outputTokens: 20,
        totalTokens: 120,
    };
    expect(aiSdkTurnEvents({ type: 'finish-step', usage })).toEqual([
        { contextTokens: 100, type: 'step-finish', usage: tokens },
    ]);
    expect(aiSdkTurnEvents({ totalUsage: usage, type: 'finish' })).toEqual([
        { claudePlanUsage: null, type: 'turn-finish', usage: tokens },
    ]);
    const [failure] = aiSdkTurnEvents({ type: 'error' });
    expect(failure).toMatchObject({ type: 'error' });
});
