import { afterEach, expect, test } from 'bun:test';
import { createFakeCloudAgentProvider } from './fake-provider.ts';
import { startCloudAgentWork } from './launch-work.ts';
import { setCloudAgentProvider } from './registry.ts';

const restores: Array<() => void> = [];
afterEach(() => {
    while (restores.length > 0) {
        restores.pop()?.();
    }
});

test('a Server freshness hold returns as-is and never asks the provider to launch', async () => {
    const provider = createFakeCloudAgentProvider();
    restores.push(setCloudAgentProvider(provider));
    const held = {
        formalMentionCount: 0,
        newMessageCount: 1,
        omittedMessageCount: 0,
        shownMessages: [],
        state: 'held' as const,
    };
    const original = globalThis.fetch;
    globalThis.fetch = (() => Promise.resolve(Response.json(held))) as unknown as typeof fetch;
    restores.push(() => {
        globalThis.fetch = original;
    });
    const reported: unknown[] = [];

    const result = await startCloudAgentWork({
        dataRoot: '/nonexistent',
        request: {
            content: 'Handing this to a cloud agent.',
            instructions: 'Reproduce the flake.',
            nonce: 'cloud-agent-nonce',
            repository: 'haus/haus',
            startingRef: 'main',
            target: '#product',
            title: 'Fix the flaky delivery test',
        },
        runnerToken: 'grtr_x',
        serverId: 'srv_cloud',
        serverOrigin: 'https://haus.test',
        supervisor: {
            reconcile: () => Promise.resolve(),
            report: (...args) => reported.push(args),
            watch: () => undefined,
        },
    });

    expect(result).toMatchObject(held);
    expect(provider.launches).toHaveLength(0);
    expect(reported).toHaveLength(0);
});
