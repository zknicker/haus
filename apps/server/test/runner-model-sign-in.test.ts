import { afterAll, beforeAll, expect, test } from 'bun:test';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import {
    type ConnectionServer,
    connectionsAnnounced,
    seedConnectionServer,
} from './model-connection.fixture.ts';
import {
    connectRunner,
    frameOfType,
    type RunnerClient,
    type RunnerFrame,
    testRunnerToken,
} from './runner.fixture.ts';

const firstCredential = {
    access: 'access-1',
    accountId: 'acct_1',
    expires: 1,
    refresh: 'refresh-1',
};
let harness: HausServerHarness;
let seed: ConnectionServer;
let runner: RunnerClient;
let connectionId: string;

beforeAll(async () => {
    harness = await startHausServerHarness({ agentLoop: 'runner', runnerToken: testRunnerToken });
    seed = await seedConnectionServer(harness, 'runner-sign-in');
});

afterAll(async () => {
    runner?.close();
    seed?.owner.close();
    await harness?.close();
});

test('sign-in answers at once when no runner is attached', async () => {
    await expect(startSignIn('ChatGPT plan')).rejects.toMatchObject({
        data: { code: 'SERVICE_UNAVAILABLE', modelConnection: { code: 'runner-not-connected' } },
        message: 'The runner is not connected, so sign-in cannot start. Try again once it is back.',
    });
});

test('a ChatGPT sign-in runs on the runner and lands as a connection', async () => {
    runner = connectRunner(harness, testRunnerToken);
    expect((await runner.next(frameOfType('runner-model-connections'))).connections).toEqual([]);

    const started = await startSignIn('ChatGPT plan');
    const { signInId } = started;
    expect(started).toMatchObject({
        label: 'ChatGPT plan',
        provider: 'chatgpt',
        state: 'waiting-for-code',
    });
    expect(await runner.next(frameOfType('runner-sign-in-start', { signInId }))).toEqual({
        provider: 'chatgpt',
        serverId: seed.serverId,
        signInId,
        type: 'runner-sign-in-start',
    });

    const coded = connectionsAnnounced(seed.serverId);
    runner.send({
        signInId,
        type: 'runner-sign-in-code',
        userCode: 'WXYZ-1234',
        verificationUri: 'https://auth.openai.com/codex/device',
    });
    await coded;
    expect(await readSignIn(signInId)).toMatchObject({
        state: 'code',
        userCode: 'WXYZ-1234',
        verificationUri: 'https://auth.openai.com/codex/device',
    });

    const seen = runner.frames.length;
    runner.send(finished(signInId, firstCredential));
    const snapshot = await runner.next(snapshotAfter(seen));
    const signedIn = await readSignIn(signInId);
    expect(signedIn.state).toBe('connected');
    connectionId = signedIn.state === 'connected' ? signedIn.connectionId : '';
    expect(snapshot.connections).toEqual([
        {
            credential: { credential: firstCredential, kind: 'oauth' },
            id: connectionId,
            label: 'ChatGPT plan',
            provider: 'chatgpt',
            serverId: seed.serverId,
            webSearch: true,
        },
    ]);
    const { connections } = await seed.owner.trpc.modelConnections.list.query({
        serverId: seed.serverId,
    });
    expect(connections).toMatchObject([
        {
            authKind: 'oauth',
            id: connectionId,
            isDefault: true,
            label: 'ChatGPT plan',
            webSearch: true,
        },
    ]);
});

test('a second sign-in under a taken label is numbered', async () => {
    const { signInId } = await startSignIn('ChatGPT plan');
    await runner.next(frameOfType('runner-sign-in-start', { signInId }));
    const seen = runner.frames.length;
    runner.send(finished(signInId, { access: 'other', expires: 5, refresh: 'other-refresh' }));
    await runner.next(snapshotAfter(seen));

    const { connections } = await seed.owner.trpc.modelConnections.list.query({
        serverId: seed.serverId,
    });
    expect(connections.map((connection) => [connection.label, connection.position])).toEqual([
        ['ChatGPT plan', 0],
        ['ChatGPT plan 2', 1],
    ]);
});

test('a rotated credential is stored only while its previous refresh matches', async () => {
    const rotated = { access: 'access-2', accountId: 'acct_1', expires: 2, refresh: 'refresh-2' };
    let seen = runner.frames.length;
    runner.send(rotation(rotated, 'refresh-1'));
    expect(credentialIn(await runner.next(snapshotAfter(seen)))).toEqual(rotated);

    seen = runner.frames.length;
    runner.send(rotation({ access: 'access-3', expires: 3, refresh: 'refresh-3' }, 'refresh-1'));
    expect(credentialIn(await runner.next(snapshotAfter(seen)))).toEqual(rotated);
});

test('cancelling a sign-in stops it on the runner', async () => {
    const { signInId } = await startSignIn('Spare plan');
    await runner.next(frameOfType('runner-sign-in-start', { signInId }));

    const cancelled = await seed.owner.trpc.modelConnections.cancelSignIn.mutate({
        serverId: seed.serverId,
        signInId,
    });

    expect(cancelled).toMatchObject({ signInId, state: 'cancelled' });
    expect(await runner.next(frameOfType('runner-sign-in-cancel', { signInId }))).toEqual({
        signInId,
        type: 'runner-sign-in-cancel',
    });
});

function startSignIn(label: string) {
    return seed.owner.trpc.modelConnections.startSignIn.mutate({
        label,
        provider: 'chatgpt',
        serverId: seed.serverId,
    });
}

function readSignIn(signInId: string) {
    return seed.owner.trpc.modelConnections.signIn.query({ serverId: seed.serverId, signInId });
}

function finished(signInId: string, credential: Record<string, unknown>) {
    return {
        result: { credential, status: 'connected' },
        signInId,
        type: 'runner-sign-in-finished',
    };
}

function rotation(credential: Record<string, unknown>, previousRefresh: string) {
    return { connectionId, credential, previousRefresh, type: 'runner-connection-credential' };
}

function snapshotAfter(seen: number) {
    return (frame: RunnerFrame) =>
        frame.type === 'runner-model-connections' && runner.frames.indexOf(frame) >= seen;
}

function credentialIn(frame: RunnerFrame) {
    const connections = frame.connections as {
        credential: { credential: unknown };
        id: string;
    }[];
    return connections.find((connection) => connection.id === connectionId)?.credential.credential;
}
