import { expect, test } from 'bun:test';
import { makeTestRuntime } from '@haus/effect';
import { ServerPostCommitWork } from './server-post-commit-work.ts';

test('server delete purge remains supervised until application drain', async () => {
    const runtime = makeTestRuntime();
    const release = Promise.withResolvers<void>();
    const work = new ServerPostCommitWork(runtime);
    let closed = false;
    try {
        void work.run('server.delete-purge', () => release.promise);
        const closing = work.close().then(() => {
            closed = true;
        });

        await Promise.resolve();
        expect(closed).toBe(false);
        release.resolve();
        await closing;
        expect(closed).toBe(true);
    } finally {
        release.resolve();
        await work.close();
        await runtime.dispose();
    }
});

test('post-commit failures log only their safe classification', async () => {
    const warnings: Array<readonly unknown[]> = [];
    const runtime = makeTestRuntime({
        output: {
            debug: ignore,
            error: ignore,
            info: ignore,
            log: ignore,
            trace: ignore,
            warn: (...values) => warnings.push(values),
        },
    });
    const work = new ServerPostCommitWork(runtime);
    try {
        await work.run('agent.dispatch-after-commit', async () => {
            throw new Error('secret upstream response');
        });
        expect(warnings).toEqual([
            [
                'Post-commit work failed; durable retry remains authoritative.',
                { failureKind: 'Error', operation: 'agent.dispatch-after-commit' },
            ],
        ]);
    } finally {
        await work.close();
        await runtime.dispose();
    }
});

test('one failed wake does not release supervision around a running sibling', async () => {
    const runtime = makeTestRuntime();
    const release = Promise.withResolvers<void>();
    const work = new ServerPostCommitWork(runtime);
    let siblingFinished = false;
    try {
        const waking = work.wakeAgents(
            {
                dispatchAgent: async (agentId) => {
                    if (agentId === 'failed') {
                        throw new Error('offline');
                    }
                    await release.promise;
                    siblingFinished = true;
                },
            },
            [
                { agentId: 'failed', serverId: 'server' },
                { agentId: 'running', serverId: 'server' },
            ]
        );
        await Promise.resolve();
        expect(siblingFinished).toBe(false);
        release.resolve();
        await waking;
        expect(siblingFinished).toBe(true);
    } finally {
        release.resolve();
        await work.close();
        await runtime.dispose();
    }
});

function ignore(..._values: readonly unknown[]) {}
