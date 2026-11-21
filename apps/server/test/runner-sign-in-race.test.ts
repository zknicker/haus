import { afterAll, beforeAll, expect, test } from 'bun:test';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import {
    type ConnectionServer,
    connectionsAnnounced,
    seedConnectionServer,
    signInConnection,
} from './model-connection.fixture.ts';
import {
    connectRunner,
    frameOfType,
    type RunnerClient,
    testRunnerToken,
} from './runner.fixture.ts';

const credential = { access: 'access-1', accountId: 'acct_1', expires: 1, refresh: 'refresh-1' };
let harness: HausServerHarness;
let seed: ConnectionServer;
let runner: RunnerClient;

beforeAll(async () => {
    harness = await startHausServerHarness({ runnerToken: testRunnerToken });
    seed = await seedConnectionServer(harness, 'sign-in-race');
    runner = connectRunner(harness, testRunnerToken);
    await runner.next(frameOfType('runner-model-connections'));
});

afterAll(async () => {
    runner?.close();
    seed?.owner.close();
    await harness?.close();
});

test('a cancel that lands first discards the finish that crossed it', async () => {
    const signInId = await startedSignIn('Cancelled plan');

    expect(await cancel(signInId)).toMatchObject({
        cancelled: true,
        signIn: { signInId, state: 'cancelled' },
    });
    runner.send(finished(signInId));
    await signInConnection(seed, runner, {
        credential: { ...credential, refresh: 'refresh-later' },
        label: 'Later plan',
        provider: 'chatgpt',
    });

    expect(await labels()).toEqual(['Later plan']);
    expect(await readSignIn(signInId)).toMatchObject({ state: 'cancelled' });
});

test('a finish that lands first refuses the cancel and stores exactly one connection', async () => {
    const signInId = await startedSignIn('Storing plan');
    const storing = connectionsAnnounced(seed.serverId);
    const seen = runner.frames.length;

    const refused = await whileServerRowIsHeld(async () => {
        runner.send(finished(signInId));
        await storing;
        expect(await readSignIn(signInId)).toMatchObject({ state: 'storing' });
        return await cancel(signInId);
    });
    await runner.next(
        (frame) => frame.type === 'runner-model-connections' && runner.frames.indexOf(frame) >= seen
    );

    expect(refused).toEqual({ cancelled: false, reason: 'completing' });
    expect(await readSignIn(signInId)).toMatchObject({ state: 'connected' });
    expect(await labels()).toEqual(['Later plan', 'Storing plan']);
    expect(runner.frames.slice(seen).map((frame) => frame.type)).toEqual([
        'runner-model-connections',
    ]);
});

async function startedSignIn(label: string) {
    const { signInId } = await seed.owner.trpc.modelConnections.startSignIn.mutate({
        label,
        provider: 'chatgpt',
        serverId: seed.serverId,
    });
    await runner.next(frameOfType('runner-sign-in-start', { signInId }));
    return signInId;
}

function cancel(signInId: string) {
    return seed.owner.trpc.modelConnections.cancelSignIn.mutate({
        serverId: seed.serverId,
        signInId,
    });
}

function readSignIn(signInId: string) {
    return seed.owner.trpc.modelConnections.signIn.query({ serverId: seed.serverId, signInId });
}

function finished(signInId: string) {
    return {
        result: { credential, status: 'connected' },
        signInId,
        type: 'runner-sign-in-finished',
    };
}

async function labels() {
    const { connections } = await seed.owner.trpc.modelConnections.list.query({
        serverId: seed.serverId,
    });
    return connections.map((connection) => connection.label);
}

async function whileServerRowIsHeld<T>(run: () => Promise<T>) {
    const holding = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const held = harness.sql.begin(async (tx: typeof harness.sql) => {
        await tx`select id from servers where id = ${seed.serverId} for update`;
        holding.resolve();
        await release.promise;
    });
    await holding.promise;
    try {
        return await run();
    } finally {
        release.resolve();
        await held;
    }
}
