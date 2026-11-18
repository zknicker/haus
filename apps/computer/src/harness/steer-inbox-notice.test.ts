import { afterAll, afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeLifecycleLoggerLayer } from '@haus/effect';
import { ManagedRuntime } from 'effect';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import type { RuntimeSession, SteerResult } from '../runtime/driver.ts';
import { createNoticeDelivery, steerInboxNotice } from './steer-inbox-notice.ts';

const roots: string[] = [];
const runtime = makeDaemonRuntime();

afterAll(() => runtime.dispose());
afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test('an unsupported steer is not claimed as a delivered inbox notice', async () => {
    const session = steering(() => ({ delivered: false, reason: 'unsupported' }));
    expect(await steerInboxNotice(session, 'new inbox message', runtime)).toBe(false);
});

test('delivery waits for the runtime acknowledgment before reporting success', async () => {
    const accepted = Promise.withResolvers<void>();
    const submitted = Promise.withResolvers<string>();
    const session = steering(async (text) => {
        submitted.resolve(text);
        await accepted.promise;
        return { delivered: true };
    });
    let settled = false;
    const delivery = steerInboxNotice(session, 'new inbox message', runtime).then((value) => {
        settled = true;
        return value;
    });
    expect(await submitted.promise).toBe('new inbox message');
    expect(settled).toBe(false);
    accepted.resolve();
    expect(await delivery).toBe(true);
});

test('a refused steer defers the notice without failing the primary turn', async () => {
    const session = steering(() => ({
        delivered: false,
        error: new Error('runtime disconnected'),
        reason: 'failed',
    }));
    expect(await steerInboxNotice(session, 'new inbox message', runtime)).toBe(false);
});

test('a notice attempted after the turn ended stays pending', async () => {
    const session = steering(() => ({ delivered: false, reason: 'idle' }));
    expect(await steerInboxNotice(session, 'late inbox message', runtime)).toBe(false);
});

test('an injected notice logs its runtime, run, and wait since it was stored', async () => {
    const logs: unknown[][] = [];
    const logged = (...values: readonly unknown[]) => logs.push([...values]);
    const loggingRuntime = ManagedRuntime.make(
        makeLifecycleLoggerLayer({
            debug: logged,
            error: logged,
            info: logged,
            log: logged,
            trace: logged,
            warn: logged,
        })
    );
    try {
        const agentRoot = await mkdtemp(join(tmpdir(), 'haus-notice-'));
        roots.push(agentRoot);
        const noticePath = join(agentRoot, 'runtime', 'pending-notice.json');
        await mkdir(join(agentRoot, 'runtime'));
        await writeFile(noticePath, `${JSON.stringify({ notice: 'new inbox message' })}\n`);
        const storedAt = new Date(Date.now() - 1500);
        await utimes(noticePath, storedAt, storedAt);
        const deliver = createNoticeDelivery(
            steering(() => ({ delivered: true })),
            {
                agentId: 'agt_notice',
                agentRoot,
                runId: 'run_notice',
                runtime: loggingRuntime,
                runtimeId: 'codex',
            }
        );

        expect(await deliver('new inbox message')).toBe(true);
        expect(logs).toHaveLength(1);
        const [message, fields] = logs[0] as [string, Record<string, unknown>];
        expect(message).toBe('Inbox notice injected into the running turn.');
        expect(fields).toMatchObject({
            agentId: 'agt_notice',
            event: 'inbox-notice-injected',
            runId: 'run_notice',
            runtimeId: 'codex',
        });
        expect(fields.elapsedMs).toBeGreaterThanOrEqual(1500);
        // A repeat of the delivered notice is not injected, so it logs nothing.
        expect(await deliver('new inbox message')).toBe(true);
        expect(logs).toHaveLength(1);
    } finally {
        await loggingRuntime.dispose();
    }
});

function steering(
    steer: (text: string) => Promise<SteerResult> | SteerResult
): Pick<RuntimeSession, 'steer'> {
    return { steer: async (text) => await steer(text) };
}
