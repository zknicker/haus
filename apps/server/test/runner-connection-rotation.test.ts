import { afterAll, beforeAll, expect, test } from 'bun:test';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import {
    type ConnectionServer,
    seedConnectionServer,
    signInConnection,
    snapshotAfter,
} from './model-connection.fixture.ts';
import {
    connectRunner,
    frameOfType,
    type RunnerClient,
    type RunnerFrame,
    testRunnerToken,
} from './runner.fixture.ts';

let harness: HausServerHarness;
let seed: ConnectionServer;
let runner: RunnerClient;
let connectionId: string;

beforeAll(async () => {
    harness = await startHausServerHarness({ runnerToken: testRunnerToken });
    seed = await seedConnectionServer(harness, 'runner-rotation');
    runner = connectRunner(harness, testRunnerToken);
    await runner.next(frameOfType('runner-model-connections'));
    connectionId = await signInConnection(seed, runner, {
        credential: credential(1),
        label: 'ChatGPT plan',
        provider: 'chatgpt',
    });
});

afterAll(async () => {
    runner?.close();
    seed?.owner.close();
    await harness?.close();
});

test('a stored rotation is acked before the snapshot that carries it, and a replay or stale rotation writes nothing', async () => {
    const first = rotation(credential(2), 'refresh-1', 1);
    let seen = runner.frames.length;
    runner.send(first);
    const stored = await runner.next(snapshotAfter(runner, seen));

    expect(runner.frames.slice(seen)).toEqual([ack(first, 'stored', 2), stored]);
    expect(heldIn(stored)).toEqual({ credential: credential(2), credentialVersion: 2 });

    seen = runner.frames.length;
    const stale = rotation(credential(3), 'refresh-1', 1);
    runner.send(first);
    runner.send(stale);
    const staleAck = await runner.next(ackOf(stale));
    const last = await runner.next(snapshotAfter(runner, runner.frames.indexOf(staleAck)));

    expect(runner.frames.slice(seen)).toEqual([
        ack(first, 'stored', 2),
        expect.objectContaining({ type: 'runner-model-connections' }),
        ack(stale, 'superseded', 2),
        last,
    ]);
    expect(heldIn(last)).toEqual({ credential: credential(2), credentialVersion: 2 });
});

test('a write the database refuses is acked failed with no snapshot, and the resend is stored', async () => {
    await harness.sql`
        alter table model_connections
        add constraint test_refuse_rotation check (credential_version < 3)
    `;
    const refused = rotation(credential(4), 'refresh-2', 2);
    const stale = rotation(credential(5), 'refresh-1', 1);
    const seen = runner.frames.length;
    runner.send(refused);
    runner.send(stale);
    const answered = await runner.next(snapshotAfter(runner, seen));

    expect(runner.frames.slice(seen)).toEqual([
        ack(refused, 'failed', 2),
        ack(stale, 'superseded', 2),
        answered,
    ]);
    expect(heldIn(answered)).toEqual({ credential: credential(2), credentialVersion: 2 });

    await harness.sql`alter table model_connections drop constraint test_refuse_rotation`;
    const resent = runner.frames.length;
    runner.send(refused);
    const stored = await runner.next(snapshotAfter(runner, resent));
    expect(runner.frames.slice(resent)).toEqual([ack(refused, 'stored', 3), stored]);
    expect(heldIn(stored)).toEqual({ credential: credential(4), credentialVersion: 3 });
});

function credential(n: number) {
    return { access: `access-${n}`, accountId: 'acct_1', expires: n, refresh: `refresh-${n}` };
}

function rotation(next: Record<string, unknown>, previousRefresh: string, baseVersion: number) {
    return {
        baseVersion,
        connectionId,
        credential: next,
        previousRefresh,
        rotationId: crypto.randomUUID(),
        type: 'runner-connection-credential',
    };
}

function ack(
    frame: ReturnType<typeof rotation>,
    result: 'failed' | 'stored' | 'superseded',
    credentialVersion: number
) {
    return {
        connectionId,
        credentialVersion,
        result,
        rotationId: frame.rotationId,
        type: 'runner-connection-credential-ack',
    };
}

function ackOf(frame: ReturnType<typeof rotation>) {
    return frameOfType('runner-connection-credential-ack', { rotationId: frame.rotationId });
}

function heldIn(frame: RunnerFrame) {
    const connections = frame.connections as {
        credential: { credential: unknown };
        credentialVersion: number;
        id: string;
    }[];
    const held = connections.find((connection) => connection.id === connectionId);
    return { credential: held?.credential.credential, credentialVersion: held?.credentialVersion };
}
