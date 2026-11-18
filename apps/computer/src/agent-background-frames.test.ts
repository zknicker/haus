import { expect, test } from 'bun:test';

import { agentSubagentWakeResultSchema } from '@haus/api';

import { handleBackgroundFrame } from './agent-background-frames.ts';
import { makeDaemonRuntime } from './daemon-runtime.ts';

/**
 * A current Server's wake result, plus a field a future Server release
 * might additively send.
 */
const wakeResultWithUnknownField = {
    agentId: 'agt_orbit',
    futureWakeResultField: true,
    outcome: 'accepted',
    type: 'agent-subagent-wake-result',
    wakeId: 'wak_1234567890',
};

test('the canonical strict wake result schema rejects a field it does not know', () => {
    expect(() => agentSubagentWakeResultSchema.parse(wakeResultWithUnknownField)).toThrow(
        /futureWakeResultField/
    );
});

test('handleBackgroundFrame tolerates a wake result carrying a field from a newer Server', () => {
    const results: unknown[] = [];
    const handled = handleBackgroundFrame(wakeResultWithUnknownField, {
        agentWork: { abortRun: () => undefined, waitForRun: () => Promise.resolve() },
        agentsDir: '/tmp/agents',
        backgroundWork: { onWakeResult: (result) => results.push(result) },
        onError: () => undefined,
        runtime: makeDaemonRuntime(),
        track: (operation) => operation,
    });
    expect(handled).toBe(true);
    expect(results).toEqual([wakeResultWithUnknownField]);
});
