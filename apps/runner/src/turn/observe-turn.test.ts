import { expect, test } from 'bun:test';
import { observeTurn } from './observe-turn.ts';
import { createRunActivity } from './run-activity.ts';
import type { TurnEvent } from './turn-event.ts';

test('a turn stuck on an open tool call trips the no-progress watchdog', async () => {
    const stalled = Promise.withResolvers<void>();
    async function* events() {
        yield {
            input: { command: 'sleep 999' },
            toolCallId: 'toolu_1',
            toolName: 'bash',
            type: 'tool-call',
        } satisfies TurnEvent;
        await stalled.promise;
        yield { type: 'abort' } satisfies TurnEvent;
    }
    const observation = await observeTurn(events(), {
        activity: createRunActivity({
            agentId: 'agt_1',
            now: () => 0,
            runId: 'run_1',
            send: () => undefined,
        }),
        gate: { toolCallSettled: async () => undefined, toolCallStarted: () => undefined },
        noProgress: { checkEveryMs: 1, deadlineMs: 5 },
        onNoProgress: () => stalled.resolve(),
    });

    expect(observation).toEqual({
        aborted: true,
        compacted: false,
        contextTokens: null,
        failure: null,
        tokenUsage: null,
    });
});
