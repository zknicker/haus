import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeTestRuntime } from '@haus/effect';
import { createFakeCloudAgentProvider } from './fake-provider.ts';
import { WorkerSendQueue } from './send-queue.ts';
import { WorkerTurnJournal } from './turn-journal.ts';

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
    for (const close of cleanup.splice(0).reverse()) {
        await close();
    }
});
const prior = {
    provider: 'cursor' as const,
    workerId: 'work',
    turnId: 'prior',
    providerAgentId: 'bc_same',
    providerRunId: 'r_prior',
};
const next = { ...prior, turnId: 'next', providerRunId: null };

const nanoLow = { id: 'gpt-5.4-nano', params: [{ id: 'reasoning', value: 'low' }] };

function sending(input: string, predecessorTurnIds: string[], model: typeof nanoLow | null) {
    return {
        input,
        model,
        phase: 'sending' as const,
        predecessorTurnIds,
        providerAgentId: 'bc_same',
        workerId: 'work',
    };
}

async function fixture() {
    const root = await mkdtemp(join(tmpdir(), 'haus-send-'));
    const journal = new WorkerTurnJournal(root);
    const runtime = makeTestRuntime();
    const provider = createFakeCloudAgentProvider();
    let active = true;
    const sent: string[] = [];
    provider.read = async () => ({
        status: active ? 'running' : 'completed',
        observedAt: new Date().toISOString(),
    });
    provider.send = async (input) => {
        sent.push(input.instructions);
        expect(input.providerAgentId).toBe('bc_same');
        expect(input.model).toEqual(input.instructions === 'Revise the same code' ? nanoLow : null);
        return {
            environmentId: null,
            environmentName: null,
            providerAgentId: 'bc_same',
            providerRunId: `r_${input.idempotencyKey}`,
            providerUrl: null,
            status: 'running',
        };
    };
    await journal.claim('server', prior);
    await journal.record('server', prior, {
        environmentId: null,
        environmentName: null,
        providerAgentId: 'bc_same',
        providerRunId: 'r_prior',
        providerUrl: null,
        status: 'running',
    });
    await journal.accept('server', next, sending('Revise the same code', ['prior'], nanoLow));
    const queue = new WorkerSendQueue(runtime, journal, 'server', () => provider);
    cleanup.push(async () => {
        await runtime.dispose();
        await rm(root, { recursive: true, force: true });
    });
    return {
        root,
        runtime,
        journal,
        provider,
        queue,
        sent,
        finish: () => {
            active = false;
        },
    };
}

test('a follow-up waits for the earlier turn, then sends once to the same agent', async () => {
    const f = await fixture();
    expect((await f.runtime.runPromise(f.queue.advance(next, () => false)))?.phase).toBe('sending');
    expect(f.sent).toEqual([]);
    f.finish();
    await f.runtime.runPromise(f.queue.advance(next, () => false));
    await f.runtime.runPromise(f.queue.advance(next, () => false));
    expect(f.sent).toEqual(['Revise the same code']);
    expect(await f.journal.read('server', next)).toMatchObject({
        phase: 'launched',
        launch: { providerAgentId: 'bc_same' },
    });
});

test('stop discards the follow-up without sending it', async () => {
    const f = await fixture();
    await f.runtime.runPromise(f.queue.advance(next, () => true));
    expect(f.sent).toEqual([]);
    expect(await f.journal.read('server', next)).toEqual({ phase: 'cancelled', workerId: 'work' });
});

test('restart reloads an accepted follow-up from private Computer storage', async () => {
    const f = await fixture();
    f.finish();
    const restored = new WorkerSendQueue(
        f.runtime,
        new WorkerTurnJournal(f.root),
        'server',
        () => f.provider
    );
    await f.runtime.runPromise(restored.advance(next, () => false));
    expect(f.sent).toHaveLength(1);
});

test('follow-ups go out in turn order', async () => {
    const f = await fixture();
    const last = { ...next, turnId: 'last' };
    await f.journal.accept('server', last, sending('Last correction', ['prior', 'next'], null));
    f.finish();
    await f.runtime.runPromise(f.queue.advance(last, () => false));
    expect(f.sent).toEqual([]);
    await f.runtime.runPromise(f.queue.advance(next, () => false));
    await f.runtime.runPromise(f.queue.advance(last, () => false));
    expect(f.sent).toEqual(['Revise the same code', 'Last correction']);
});

test('concurrent queue ticks do not send twice', async () => {
    const f = await fixture();
    f.finish();
    await Promise.all([
        f.runtime.runPromise(f.queue.advance(next, () => false)),
        f.runtime.runPromise(f.queue.advance(next, () => false)),
    ]);
    expect(f.sent).toHaveLength(1);
});
