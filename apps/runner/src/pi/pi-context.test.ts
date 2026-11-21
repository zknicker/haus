import { afterEach, expect, test } from 'bun:test';
import { fauxAssistantMessage, fauxText } from '@earendil-works/pi-ai/providers/faux';
import { DEFAULT_COMPACTION_POLICY } from '@earendil-works/pi-durable';
import { drainCleanups, live, startedRun } from '../runner-test-server.ts';
import { agentDir, collect, fauxHarness, launch } from './pi-faux-run.ts';

afterEach(drainCleanups);

test('a Pi session reports its model window, where Pi compacts, and its tool schemas', async () => {
    const { run } = await startedRun();
    const harness = fauxHarness([fauxAssistantMessage([fauxText('Hi.')])]);
    const driver = harness.factory(launch(await agentDir(), run.tools));
    const session = await driver.openSession({ resumeFrom: undefined, sessionId: 'agt_1-1' });
    const turn = await session.startTurn({ prompt: 'Hello.', signal: live() });
    await collect(turn.events);
    await turn.settle();

    const context = await session.contextUsage();

    if (context?.kind !== 'window') {
        throw new Error(`Expected a window context, got ${JSON.stringify(context)}.`);
    }
    expect(context.compactAtTokens).toBe(
        context.contextWindow -
            DEFAULT_COMPACTION_POLICY.reserveTokens -
            DEFAULT_COMPACTION_POLICY.backgroundTokens
    );
    expect(context.toolTokens).toBeGreaterThan(500);
    await session.destroy();
});
