import { afterEach, expect, test } from 'bun:test';
import { startAttachmentHeartbeat } from './attachment-heartbeat.ts';
import { type DaemonRuntime, makeDaemonRuntime } from './daemon-runtime.ts';

const runtimes: DaemonRuntime[] = [];

afterEach(async () => {
    await Promise.all(runtimes.splice(0).map((runtime) => runtime.dispose()));
});

function fixture() {
    const sent: string[] = [];
    let terminated = 0;
    const socket = {
        readyState: WebSocket.OPEN,
        send: (frame: string) => sent.push(frame),
        terminate: () => {
            terminated += 1;
        },
    } as unknown as WebSocket;
    return {
        get terminated() {
            return terminated;
        },
        sent,
        socket,
    };
}

test('the Effect-owned heartbeat stops emitting after disposal', async () => {
    const runtime = makeDaemonRuntime();
    runtimes.push(runtime);
    const target = fixture();
    const heartbeat = startAttachmentHeartbeat({
        configuration: { intervalMs: 5, timeoutMs: 100, type: 'heartbeat-configuration' },
        runtime,
        socket: target.socket,
    });
    await Bun.sleep(16);
    expect(target.sent.length).toBeGreaterThan(1);
    heartbeat.dispose();
    const settledCount = target.sent.length;
    await Bun.sleep(12);
    expect(target.sent).toHaveLength(settledCount);
    expect(target.terminated).toBe(0);
});

test('a missing acknowledgement terminates the socket at the deadline', async () => {
    const runtime = makeDaemonRuntime();
    runtimes.push(runtime);
    const target = fixture();
    startAttachmentHeartbeat({
        configuration: { intervalMs: 5, timeoutMs: 20, type: 'heartbeat-configuration' },
        runtime,
        socket: target.socket,
    });
    await Bun.sleep(30);
    expect(target.terminated).toBe(1);
});
