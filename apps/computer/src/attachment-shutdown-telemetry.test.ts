import { expect, test } from 'bun:test';
import { Effect } from 'effect';
import { AttachmentDaemonWork } from './attachment-daemon-work.ts';
import { drainAttachmentDaemon, withAttachmentShutdown } from './attachment-shutdown.ts';
import { makeDaemonRuntime } from './daemon-runtime.ts';

test('a stalled telemetry relay cannot fail a clean attachment shutdown', async () => {
    const relay = Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        fetch: () => new Promise<Response>(() => {}),
    });
    const runtime = makeDaemonRuntime({
        telemetryRelay: {
            credential: 'test-only',
            serverOrigin: `http://127.0.0.1:${relay.port}`,
        },
    });
    const work = new AttachmentDaemonWork(runtime);
    try {
        await runtime.runPromise(Effect.void.pipe(Effect.withSpan('computer.test.shutdown')));
        await expect(
            withAttachmentShutdown(work, runtime, 'srv_test', drainAttachmentDaemon)
        ).resolves.toBeUndefined();
    } finally {
        relay.stop(true);
        await runtime.dispose();
    }
}, 10_000);
