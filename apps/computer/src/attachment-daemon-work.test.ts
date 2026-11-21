import { expect, test } from 'bun:test';
import { AttachmentDaemonWork } from './attachment-daemon-work.ts';
import { makeDaemonRuntime } from './daemon-runtime.ts';

test('reconnect routes frames through the current socket', async () => {
    const runtime = makeDaemonRuntime();
    const work = new AttachmentDaemonWork(runtime);
    const firstFrames: unknown[] = [];
    const secondFrames: unknown[] = [];
    const detachFirst = work.attachSender({
        send: (frame) => {
            firstFrames.push(frame);
            return true;
        },
    });

    detachFirst();
    work.attachSender({
        send: (frame) => {
            secondFrames.push(frame);
            return true;
        },
    });
    expect(work.send({ runId: 'run_test', type: 'invoke-result' })).toBe(true);
    expect(firstFrames).toEqual([]);
    expect(secondFrames).toEqual([{ runId: 'run_test', type: 'invoke-result' }]);

    await work.close();
    await runtime.dispose();
});

test('shutdown waits for accepted writers', async () => {
    const runtime = makeDaemonRuntime();
    const work = new AttachmentDaemonWork(runtime);
    const gate = Promise.withResolvers<void>();
    let settled = false;
    const writer = work.track(
        gate.promise.then(() => {
            settled = true;
        })
    );

    const closing = work.close();
    await Promise.resolve();
    expect(settled).toBe(false);
    gate.resolve();
    await Promise.all([writer, closing]);
    expect(settled).toBe(true);
    await runtime.dispose();
});

test('shutdown deadline reports the incomplete drain and refuses late frames', async () => {
    const { makeTestRuntime } = await import('@haus/effect');
    const { TestClock } = await import('effect');
    const runtime = makeTestRuntime();
    const work = new AttachmentDaemonWork(runtime);
    work.track(new Promise(() => {}));
    const result = work.close().then(
        () => null,
        (error: unknown) => error
    );
    await runtime.runPromise(TestClock.adjust('20 seconds'));
    expect(await result).toBeInstanceOf(Error);
    expect(String(await result)).toContain('timed out while draining accepted work');
    expect(work.send({ type: 'late' })).toBe(false);
    await runtime.dispose();
});
