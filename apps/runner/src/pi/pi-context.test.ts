import { afterEach, expect, test } from 'bun:test';
import { fauxAssistantMessage, fauxText } from '@earendil-works/pi-ai/providers/faux';
import {
    type CompactionSettings,
    DEFAULT_COMPACTION_POLICY,
    type HarnessSettings,
} from '@earendil-works/pi-durable';
import { drainCleanups, live, startedRun } from '../runner-test-server.ts';
import { piCompactionPolicy, piHarnessContext } from './pi-context.ts';
import { agentDir, collect, fauxHarness, launch } from './pi-faux-run.ts';
import { piSettings } from './pi-session.ts';

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

const ref = { modelId: 'faux-1', provider: 'faux' };
const model = { contextWindow: 200_000 };

function compactAt(settings: HarnessSettings, conversation?: CompactionSettings) {
    return piHarnessContext({
        model,
        policy: piCompactionPolicy(settings, ref, conversation),
        tools: [],
    }).compactAtTokens;
}

test('the runner settings resolve to the Pi default policy', () => {
    expect(piCompactionPolicy(piSettings, ref, undefined)).toEqual(DEFAULT_COMPACTION_POLICY);
    expect(compactAt(piSettings)).toBe(
        200_000 -
            DEFAULT_COMPACTION_POLICY.reserveTokens -
            DEFAULT_COMPACTION_POLICY.backgroundTokens
    );
});

test('a compaction override in the settings moves where Pi compacts', () => {
    expect(compactAt({ compaction: { reserveTokens: 8000 } })).toBe(
        200_000 - 8000 - DEFAULT_COMPACTION_POLICY.backgroundTokens
    );
    expect(compactAt({ compaction: { backgroundTokens: 0, reserveTokens: 8000 } })).toBe(192_000);
    expect(
        compactAt({
            compaction: {
                modelOverrides: { 'faux/faux-1': { backgroundTokens: 50_000 } },
                reserveTokens: 10_000,
            },
        })
    ).toBe(140_000);
    expect(compactAt({ compaction: { reserveTokens: 10_000 } }, { backgroundTokens: 0 })).toBe(
        190_000
    );
});

test('with compaction off, the threshold is the whole window', () => {
    expect(compactAt({ compaction: { enabled: false } })).toBe(200_000);
    expect(compactAt(piSettings, { enabled: false })).toBe(200_000);
    expect(
        compactAt(
            { compaction: { modelOverrides: { 'faux/faux-1': { enabled: true } } } },
            { enabled: false }
        )
    ).toBe(200_000);
});
