import { expect, test } from 'bun:test';
import { parseRestartCommand, parseStartCommand } from './agent-command-frames.ts';

test('accepts only a valid trace carrier on a start command', () => {
    const frame = {
        agentId: 'agt_launchtest',
        chatId: 'cht_origin',
        inbox: [],
        inboxDelivery: 'notice',
        modelId: 'gpt-5',
        runId: 'run_launchtest',
        runtimeId: 'codex',
        sessionGeneration: 1,
        totalPending: 0,
        type: 'start',
    } as const;
    const traceContext = {
        traceparent: `00-${'a'.repeat(32)}-${'b'.repeat(16)}-01`,
    };

    expect(parseStartCommand({ ...frame, traceContext })?.traceContext).toEqual(traceContext);
    expect(
        parseStartCommand({ ...frame, traceContext: { traceparent: 'private garbage' } })
    ).toBeNull();
});

test('restart commands require one Agent id', () => {
    expect(parseRestartCommand({ agentId: 'agt_restart', type: 'agent-restart' })).toEqual({
        agentId: 'agt_restart',
        type: 'agent-restart',
    });
    expect(parseRestartCommand({ agentId: '', type: 'agent-restart' })).toBe(null);
    expect(parseRestartCommand({ agentId: 'agt_restart', type: 'agent-reset' })).toBe(null);
});
