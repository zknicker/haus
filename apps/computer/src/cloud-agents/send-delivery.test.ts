import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CloudAgentStatus } from '@haus/api';
import { makeTestRuntime } from '@haus/effect';
import { type Duration, TestClock } from 'effect';
import { recordedAgentBusyError } from './cursor/recorded-transport.ts';
import { createFakeCloudAgentProvider } from './fake-provider.ts';
import { CloudLaunchJournal } from './launch-journal.ts';
import { CloudAgentLaunchRejectedError, type CloudAgentRunRef } from './provider.ts';
import { CloudAgentSendQueue } from './send-queue.ts';

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
    for (const close of cleanup.splice(0).reverse()) {
        await close();
    }
});

const prior = {
    provider: 'cursor' as const,
    workId: 'work',
    runId: 'prior',
    providerAgentId: 'bc_same',
    providerRunId: 'r_p',
};
const next = { ...prior, runId: 'next', providerRunId: null };

async function fixture(options: { predecessor?: CloudAgentRunRef; interrupt?: boolean } = {}) {
    const root = await mkdtemp(join(tmpdir(), 'haus-send-delivery-'));
    const journal = new CloudLaunchJournal(root);
    const runtime = makeTestRuntime();
    const provider = createFakeCloudAgentProvider();
    let priorStatus: CloudAgentStatus = 'completed';
    provider.read = async () => ({ observedAt: new Date().toISOString(), status: priorStatus });
    const failures: Error[] = [];
    let sends = 0;
    let cancels = 0;
    provider.send = async (input) => {
        sends += 1;
        const failure = failures.shift();
        if (failure) {
            throw failure;
        }
        return {
            providerAgentId: input.providerAgentId,
            providerRunId: `r_${input.idempotencyKey}`,
            providerUrl: null,
            status: 'running',
        };
    };
    const baseCancel = provider.cancel.bind(provider);
    provider.cancel = async (ref, signal) => {
        cancels += 1;
        await baseCancel(ref, signal);
    };
    await journal.claim('server', next, {
        phase: 'pending',
        workId: 'work',
        providerAgentId: 'bc_same',
        instructions: 'Revise the same code',
        interrupt: options.interrupt ?? false,
        predecessors: [options.predecessor ?? prior],
    });
    const queue = new CloudAgentSendQueue(runtime, journal, 'server', () => provider);
    cleanup.push(async () => {
        await runtime.dispose();
        await rm(root, { recursive: true, force: true });
    });
    return {
        advance: () => runtime.runPromise(queue.advance(next, () => false)),
        advanceRestored: (restored: CloudAgentSendQueue) =>
            runtime.runPromise(restored.advance(next, () => false)),
        cancels: () => cancels,
        failures,
        journal,
        provider,
        read: () => journal.read('server', next),
        root,
        runtime,
        sends: () => sends,
        setPriorStatus: (status: CloudAgentStatus) => {
            priorStatus = status;
        },
        wait: (duration: Duration.DurationInput) => runtime.runPromise(TestClock.adjust(duration)),
    };
}

test('a definite refusal fails the follow-up at once with the provider reason', async () => {
    const f = await fixture();
    f.failures.push(
        new CloudAgentLaunchRejectedError('Invalid API key', { providerCode: 'unauthorized' })
    );
    expect(await f.advance()).toEqual({
        phase: 'rejected',
        workId: 'work',
        errorCode: 'followup-delivery-rejected',
        summary: 'The provider rejected the follow-up: Invalid API key (unauthorized)',
    });
    expect(f.sends()).toBe(1);
    // Settled: later ticks never resend.
    await f.wait('1 hour');
    await f.advance();
    expect(f.sends()).toBe(1);
});

test('a busy agent retries with backoff under the same Run, then delivers', async () => {
    const f = await fixture();
    f.failures.push(recordedAgentBusyError(), recordedAgentBusyError());
    expect(await f.advance()).toMatchObject({
        phase: 'pending',
        delivery: { attempts: 1, lastError: 'Agent already has an active run in progress' },
    });
    // Backoff holds the next attempt; a tick inside it sends nothing.
    await f.advance();
    expect(f.sends()).toBe(1);
    await f.wait('5 seconds');
    expect(await f.advance()).toMatchObject({ phase: 'pending', delivery: { attempts: 2 } });
    await f.wait('9 seconds');
    await f.advance();
    expect(f.sends()).toBe(2);
    await f.wait('1 second');
    expect(await f.advance()).toMatchObject({
        phase: 'launched',
        launch: { providerRunId: 'r_next' },
    });
    expect(f.sends()).toBe(3);
});

test('busy past the interrupt grace period is auto-interrupted, then keeps retrying instead of failing', async () => {
    const f = await fixture();
    f.failures.push(...Array.from({ length: 100 }, () => recordedAgentBusyError()));
    let record = await f.advance();
    for (let minute = 0; minute < 10 && record?.phase === 'pending'; minute += 1) {
        await f.wait('1 minute');
        record = await f.advance();
    }
    // Never settles: cancel() was tried (the fake always succeeds), the retry right
    // after it still failed (all 100 queued failures), and it keeps retrying past that.
    expect(record).toMatchObject({
        delivery: { interruptedAt: expect.any(String) },
        phase: 'pending',
    });
    expect(f.cancels()).toBe(1);
    const sendsAtInterrupt = f.sends();
    await f.wait('5 minutes');
    await f.advance();
    expect(f.sends()).toBeGreaterThan(sendsAtInterrupt);
    // The one auto-interrupt already happened; later ticks never try a second one.
    expect(f.cancels()).toBe(1);
});

test('once interrupted, a send that then succeeds delivers and is flagged auto-interrupted', async () => {
    const f = await fixture();
    f.failures.push(...Array.from({ length: 100 }, () => recordedAgentBusyError()));
    let record = await f.advance();
    for (
        let minute = 0;
        minute < 10 && record?.phase === 'pending' && !record.delivery?.interruptedAt;
        minute += 1
    ) {
        await f.wait('1 minute');
        record = await f.advance();
    }
    expect(record).toMatchObject({
        phase: 'pending',
        delivery: { interruptedAt: expect.any(String) },
    });
    expect(f.cancels()).toBe(1);
    // The provider is free again: the very next attempt (plain backoff, no second interrupt) delivers.
    f.failures.length = 0;
    await f.wait('1 minute');
    expect(await f.advance()).toMatchObject({ autoInterrupted: true, phase: 'launched' });
    expect(f.cancels()).toBe(1);
});

test('when the auto-interrupt call itself fails, the follow-up still stays pending and keeps retrying', async () => {
    const f = await fixture();
    f.failures.push(...Array.from({ length: 100 }, () => recordedAgentBusyError()));
    f.provider.cancel = () => Promise.reject(new Error('The provider refused to interrupt.'));
    let record = await f.advance();
    for (let minute = 0; minute < 10 && record?.phase === 'pending'; minute += 1) {
        await f.wait('1 minute');
        record = await f.advance();
    }
    expect(record).toMatchObject({
        delivery: { interruptedAt: expect.any(String) },
        phase: 'pending',
    });
});

test('the interrupt grace period and its outcome survive a Computer restart, still never rejecting', async () => {
    const f = await fixture();
    f.failures.push(...Array.from({ length: 100 }, () => recordedAgentBusyError()));
    await f.advance();
    await f.wait('90 seconds');
    // A Computer restart loses every in-memory timer: fresh objects, same journal file on disk.
    const restored = new CloudAgentSendQueue(
        f.runtime,
        new CloudLaunchJournal(f.root),
        'server',
        () => f.provider
    );
    let record = await f.advanceRestored(restored);
    for (let minute = 0; minute < 10 && record?.phase === 'pending'; minute += 1) {
        await f.wait('1 minute');
        record = await f.advanceRestored(restored);
    }
    // ~10 minutes total, well past the 2-minute grace counted from the first attempt
    // (not from the restart): auto-interrupted, still pending, never rejected.
    expect(record).toMatchObject({
        delivery: { interruptedAt: expect.any(String) },
        phase: 'pending',
    });
    const sendsSoFar = f.sends();
    await f.wait('5 minutes');
    await f.advanceRestored(restored);
    expect(f.sends()).toBeGreaterThan(sendsSoFar);
});

test('waiting behind a running predecessor never counts against the deadline', async () => {
    const f = await fixture();
    f.setPriorStatus('running');
    await f.advance();
    await f.wait('3 hours');
    expect(await f.advance()).toMatchObject({ phase: 'pending', delivery: null });
    expect(f.sends()).toBe(0);
    f.setPriorStatus('completed');
    expect(await f.advance()).toMatchObject({ phase: 'launched' });
});

test('waiting behind a predecessor that runs for hours never counts against the deadline', async () => {
    const f = await fixture();
    f.setPriorStatus('running');
    await f.advance();
    await f.wait('6 hours');
    expect(await f.advance()).toMatchObject({ phase: 'pending', delivery: null });
    expect(f.sends()).toBe(0);
    f.setPriorStatus('completed');
    expect(await f.advance()).toMatchObject({ phase: 'launched' });
});

test('a follow-up is delivered immediately behind a Claude predecessor that is still genuinely running', async () => {
    // A Cursor predecessor this busy would block forever (see the two tests above);
    // Haus never even reads a Claude predecessor's status before sending (TECH-7,
    // round 4) — hosted sessions take the next prompt the moment the one ahead of
    // it was dispatched, exactly like a message sent mid-turn in local Claude Code.
    const claudePrior = { ...prior, provider: 'claude' as const };
    const f = await fixture({ predecessor: claudePrior });
    f.setPriorStatus('running');
    expect(await f.advance()).toMatchObject({ phase: 'launched' });
    expect(f.sends()).toBe(1);
});

test('a predecessor that settled in any terminal state unblocks the follow-up', async () => {
    for (const status of ['completed', 'failed', 'cancelled', 'expired'] as const) {
        const f = await fixture();
        f.setPriorStatus(status);
        expect((await f.advance())?.phase).toBe('launched');
    }
});

test('a predecessor that failed before reaching the provider unblocks the follow-up', async () => {
    const orphan = { ...prior, runId: 'orphan', providerRunId: null };
    const f = await fixture({ predecessor: orphan });
    // No record yet: the predecessor's own monitor is still inside its grace window.
    expect((await f.advance())?.phase).toBe('pending');
    await f.journal.claim('server', orphan, {
        phase: 'rejected',
        workId: 'work',
        errorCode: 'launch-record-missing',
        summary: 'Never sent.',
    });
    expect((await f.advance())?.phase).toBe('launched');
});

test('interrupt claims an unrecorded predecessor as cancelled and sends', async () => {
    const orphan = { ...prior, runId: 'orphan', providerRunId: null };
    const f = await fixture({ predecessor: orphan, interrupt: true });
    expect((await f.advance())?.phase).toBe('launched');
    expect(await f.journal.read('server', orphan)).toEqual({ phase: 'cancelled', workId: 'work' });
});
