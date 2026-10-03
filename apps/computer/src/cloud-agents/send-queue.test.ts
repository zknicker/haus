import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeTestRuntime } from '@haus/effect';
import { createFakeCloudAgentProvider } from './fake-provider.ts';
import { CloudLaunchJournal } from './launch-journal.ts';
import { CloudAgentSendQueue } from './send-queue.ts';

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
    for (const close of cleanup.splice(0).reverse()) {
        await close();
    }
});
const prior = {
    workId: 'work',
    runId: 'prior',
    providerAgentId: 'bc_same',
    providerRunId: 'r_prior',
};
const next = { ...prior, runId: 'next', providerRunId: null };

const nanoLow = { id: 'gpt-5.4-nano', params: [{ id: 'reasoning', value: 'low' }] };

async function fixture(interrupt = false) {
    const root = await mkdtemp(join(tmpdir(), 'haus-send-'));
    const journal = new CloudLaunchJournal(root);
    const runtime = makeTestRuntime();
    const provider = createFakeCloudAgentProvider();
    let active = true;
    const sent: string[] = [];
    provider.read = async () => ({
        status: active ? 'running' : 'completed',
        observedAt: new Date().toISOString(),
    });
    provider.cancel = async () => {
        active = false;
    };
    provider.send = async (input) => {
        sent.push(input.instructions);
        expect(input.providerAgentId).toBe('bc_same');
        // The fixture's own pending send carries the model Server resolved for its Run.
        expect(input.model).toEqual(input.instructions === 'Revise the same code' ? nanoLow : null);
        return {
            providerAgentId: 'bc_same',
            providerRunId: `r_${input.idempotencyKey}`,
            providerUrl: null,
            status: 'running',
        };
    };
    await journal.claim('server', next, {
        phase: 'pending',
        workId: 'work',
        providerAgentId: 'bc_same',
        model: nanoLow,
        instructions: 'Revise the same code',
        interrupt,
        predecessors: [prior],
    });
    const queue = new CloudAgentSendQueue(runtime, journal, 'server', () => provider);
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

test('a busy agent accepts a queued prompt, then sends once to the same agent', async () => {
    const f = await fixture();
    expect((await f.runtime.runPromise(f.queue.advance(next, () => false)))?.phase).toBe('pending');
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

test('interrupt stops the previous run before sending the correction', async () => {
    const f = await fixture(true);
    await f.runtime.runPromise(f.queue.advance(next, () => false));
    expect(f.sent).toEqual([]);
    await f.runtime.runPromise(f.queue.advance(next, () => false));
    expect(f.sent).toHaveLength(1);
});

test('stop discards the pending prompt after stopping active work', async () => {
    const f = await fixture();
    await f.runtime.runPromise(f.queue.advance(next, () => true));
    await f.runtime.runPromise(f.queue.advance(next, () => true));
    expect(f.sent).toEqual([]);
    expect(await f.journal.read('server', next)).toEqual({ phase: 'cancelled', workId: 'work' });
});

test('restart reloads a queued prompt from private Computer storage', async () => {
    const f = await fixture();
    f.finish();
    const restored = new CloudAgentSendQueue(
        f.runtime,
        new CloudLaunchJournal(f.root),
        'server',
        () => f.provider
    );
    await f.runtime.runPromise(restored.advance(next, () => false));
    expect(f.sent).toHaveLength(1);
});

test('multiple pending prompts preserve order', async () => {
    const f = await fixture();
    const last = { ...next, runId: 'last' };
    await f.journal.claim('server', last, {
        phase: 'pending',
        workId: 'work',
        providerAgentId: 'bc_same',
        model: null,
        instructions: 'Last correction',
        interrupt: false,
        predecessors: [prior, next],
    });
    f.finish();
    await f.runtime.runPromise(f.queue.advance(last, () => false));
    expect(f.sent).toEqual([]);
    await f.runtime.runPromise(f.queue.advance(next, () => false));
    await f.runtime.runPromise(f.queue.advance(last, () => false));
    expect(f.sent).toEqual(['Revise the same code', 'Last correction']);
});

test('interrupt discards older queued prompts before sending the replacement', async () => {
    const f = await fixture();
    const replacement = { ...next, runId: 'replacement' };
    await f.journal.claim('server', replacement, {
        phase: 'pending',
        workId: 'work',
        providerAgentId: 'bc_same',
        model: null,
        instructions: 'Replacement',
        interrupt: true,
        predecessors: [prior, next],
    });
    await f.runtime.runPromise(f.queue.advance(replacement, () => false));
    await f.runtime.runPromise(f.queue.advance(replacement, () => false));
    await f.runtime.runPromise(f.queue.advance(next, () => false));
    expect(f.sent).toEqual(['Replacement']);
    expect(await f.journal.read('server', next)).toEqual({ phase: 'cancelled', workId: 'work' });
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
