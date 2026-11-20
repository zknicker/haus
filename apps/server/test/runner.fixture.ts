import { runnerSocketPath } from '@haus/api';
import { WebSocket } from 'ws';
import type { HausServerHarness } from './haus-server-harness.ts';

export const testRunnerToken = `runner-token-${'r'.repeat(40)}`;

export interface RunnerFrame {
    type: string;
    [key: string]: unknown;
}

export interface RunnerClient {
    close(): void;
    closed: Promise<{ code: number; reason: string }>;
    frames: RunnerFrame[];
    next(predicate: (frame: RunnerFrame) => boolean): Promise<RunnerFrame>;
    opened: Promise<void>;
    send(frame: unknown): void;
}

export function connectRunner(harness: HausServerHarness, token: string) {
    const url = new URL(runnerSocketPath, harness.url);
    url.protocol = 'ws:';
    const socket = new WebSocket(url);
    const frames: RunnerFrame[] = [];
    const waiters: {
        predicate: (frame: RunnerFrame) => boolean;
        resolve(frame: RunnerFrame): void;
    }[] = [];
    socket.on('message', (raw) => {
        const frame = JSON.parse(raw.toString()) as RunnerFrame;
        frames.push(frame);
        for (const waiter of waiters.filter((candidate) => candidate.predicate(frame))) {
            waiters.splice(waiters.indexOf(waiter), 1);
            waiter.resolve(frame);
        }
    });
    const opened = new Promise<void>((resolve, reject) => {
        socket.once('open', () => {
            socket.send(JSON.stringify({ token, type: 'runner-hello' }));
            resolve();
        });
        socket.once('error', reject);
    });
    const closed = new Promise<{ code: number; reason: string }>((resolve) => {
        socket.once('close', (code, reason) => resolve({ code, reason: reason.toString() }));
    });
    const client: RunnerClient = {
        close: () => socket.close(),
        closed,
        frames,
        next: (predicate) => {
            const seen = frames.find(predicate);
            if (seen) {
                return Promise.resolve(seen);
            }
            return new Promise((resolve) => {
                waiters.push({ predicate, resolve });
            });
        },
        opened,
        send: (frame) => socket.send(JSON.stringify(frame)),
    };
    return client;
}

export function frameOfType(type: string, match: Record<string, unknown> = {}) {
    return (frame: RunnerFrame) =>
        frame.type === type && Object.entries(match).every(([key, value]) => frame[key] === value);
}

export const testRunnerRuntimes = [
    { id: 'codex', label: 'Codex', models: [{ id: 'gpt-5.6-sol', label: 'Sol' }] },
    { id: 'claude', label: 'Claude', models: [{ id: 'claude-opus', label: 'Opus' }] },
];

export async function reportRunnerModels(
    harness: HausServerHarness,
    options: { attached?: RunnerClient; runtimes?: unknown[] } = {}
) {
    const { attached, runtimes = testRunnerRuntimes } = options;
    const client = attached ?? connectRunner(harness, testRunnerToken);
    if (!attached) {
        await client.next(frameOfType('runner-hello-accepted'));
    }
    client.send({
        harnesses: ['claude-agent-sdk', 'pi-durable'],
        runtimes,
        type: 'runner-inventory',
    });
    const rotationId = crypto.randomUUID();
    client.send({
        baseVersion: 1,
        connectionId: 'mc_inventory_barrier',
        credential: { access: 'barrier', expires: 0, refresh: 'barrier' },
        previousRefresh: 'barrier',
        rotationId,
        type: 'runner-connection-credential',
    });
    await client.next(
        (frame) =>
            frame.type === 'runner-connection-credential-ack' && frame.rotationId === rotationId
    );
    if (!attached) {
        client.close();
        await client.closed;
    }
}
