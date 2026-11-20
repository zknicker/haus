import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRunDispatches } from './dispatch-id.ts';
import { openDispatchLedger } from './ledger.ts';

const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
    for (const cleanup of cleanups.splice(0)) {
        await cleanup();
    }
});

describe('runner dispatch ledger', () => {
    test('a dispatch left accepted by a crashed runner is reported unknown and never sent', async () => {
        const { dataDir, sendTarget, received } = await fixture();
        const crashed = createRunDispatches({
            agentId: 'agt_1',
            ledger: openDispatchLedger(dataDir),
            runId: 'run.1',
        });
        const sent = await crashed.open('toolu_a', 'agent-api');
        await fetch(sendTarget, { body: 'sent', method: 'POST' });
        await crashed.finish(sent, 'completed');
        await crashed.open('toolu_a', 'agent-api');
        await crashed.open('toolu_b', 'invocation');

        const restarted = openDispatchLedger(dataDir, () => new Date('2026-11-19T12:00:00.000Z'));
        const recovered = await restarted.recover();

        expect(recovered).toEqual([
            {
                agentId: 'agt_1',
                key: { runId: 'run.1', seq: 1, toolCallId: 'toolu_a' },
                kind: 'agent-api',
            },
            {
                agentId: 'agt_1',
                key: { runId: 'run.1', seq: 0, toolCallId: 'toolu_b' },
                kind: 'invocation',
            },
        ]);
        expect(
            await restarted.read('agt_1', { runId: 'run.1', seq: 1, toolCallId: 'toolu_a' })
        ).toMatchObject({
            finishedAt: '2026-11-19T12:00:00.000Z',
            outcome: 'unknown',
            state: 'finished',
        });
        expect(
            await restarted.read('agt_1', { runId: 'run.1', seq: 0, toolCallId: 'toolu_a' })
        ).toMatchObject({ outcome: 'completed', state: 'finished' });
        expect(await restarted.recover()).toEqual([]);
        expect(received).toEqual(['sent']);
    });

    test('finished records are pruned 24 hours after their run settles, never before it settles', async () => {
        const { dataDir } = await fixture();
        let clock = new Date('2026-11-19T00:00:00.000Z');
        const ledger = openDispatchLedger(dataDir, () => clock);
        const dispatches = createRunDispatches({ agentId: 'agt_1', ledger, runId: 'run_1' });
        const finished = await dispatches.open('toolu_a', 'mcp-call');
        await dispatches.finish(finished, 'failed');
        const quiet = createRunDispatches({ agentId: 'agt_1', ledger, runId: 'run_2' });
        await quiet.finish(await quiet.open('toolu_b', 'invocation'), 'completed');

        clock = new Date('2026-11-21T00:00:00.000Z');
        expect(await ledger.prune()).toBe(0);
        await ledger.settled('agt_1', 'run_1');
        clock = new Date('2026-11-21T12:00:00.000Z');
        await ledger.settled('agt_1', 'run_1');
        clock = new Date('2026-11-21T23:59:59.000Z');
        expect(await ledger.prune()).toBe(0);
        clock = new Date('2026-11-22T00:00:00.000Z');
        expect(await ledger.prune()).toBe(1);

        const dir = join(dataDir, 'agents', 'agt_1', 'runtime', 'dispatches');
        expect(await readdir(dir)).toEqual(['run_2.toolu_b.0.json']);
    });

    test('a settled run keeps a record still accepted and forgets the rest after 24 hours', async () => {
        const { dataDir } = await fixture();
        let clock = new Date('2026-11-19T00:00:00.000Z');
        const ledger = openDispatchLedger(dataDir, () => clock);
        const dispatches = createRunDispatches({ agentId: 'agt_1', ledger, runId: 'run_1' });
        await dispatches.finish(await dispatches.open('toolu_a', 'mcp-call'), 'failed');
        await dispatches.open('toolu_a', 'mcp-call');
        await ledger.settled('agt_1', 'run_1');

        clock = new Date('2026-11-20T00:00:00.000Z');
        expect(await ledger.prune()).toBe(1);

        const dir = join(dataDir, 'agents', 'agt_1', 'runtime', 'dispatches');
        expect(await readdir(dir)).toEqual(['run_1.toolu_a.1.json']);
    });
});

async function fixture() {
    const dataDir = await mkdtemp(join(tmpdir(), 'haus-runner-ledger-'));
    const received: string[] = [];
    const server = Bun.serve({
        fetch: async (request) => {
            received.push(await request.text());
            return new Response('ok');
        },
        hostname: '127.0.0.1',
        port: 0,
    });
    cleanups.push(async () => {
        await server.stop(true);
        await rm(dataDir, { force: true, recursive: true });
    });
    return { dataDir, received, sendTarget: `http://127.0.0.1:${server.port}/` };
}
