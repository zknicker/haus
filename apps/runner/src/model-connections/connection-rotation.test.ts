import { afterEach, describe, expect, test } from 'bun:test';
import type { Credential } from '@earendil-works/pi-ai';
import type { RunnerModelConnection, RunnerUpFrame } from '@haus/api';
import { connectionCredentialStore } from '../pi/pi-connection-credentials.ts';
import {
    attachRunner,
    drainCleanups,
    type ServerStandIn,
    serverStandIn,
} from '../runner-test-server.ts';

afterEach(drainCleanups);

const farFuture = 4_102_444_800_000;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
let barriers = 0;

function oauth(n: number, expires = farFuture) {
    return { access: `access-${n}`, accountId: 'acct_1', expires, refresh: `refresh-${n}` };
}

function plan(n: number, credentialVersion: number, label = 'Plus', expires = farFuture) {
    const connection: RunnerModelConnection = {
        credential: { credential: oauth(n, expires), kind: 'oauth' },
        credentialVersion,
        id: 'mc_chatgpt',
        label,
        provider: 'chatgpt',
        serverId: 'srv_1',
        webSearch: true,
    };
    return connection;
}

function piCredential(n: number) {
    const credential: Credential = { ...oauth(n), type: 'oauth' };
    return credential;
}

async function rotatingRunner() {
    const server = serverStandIn();
    const runner = await attachRunner(server);
    await server.frame('runner-inventory');
    const store = connectionCredentialStore({
        book: runner.book,
        connectionId: 'mc_chatgpt',
        link: runner.link,
        providerId: 'openai-codex',
    });
    return { runner, server, store };
}

async function handled(server: ServerStandIn) {
    barriers += 1;
    const runId = `run_barrier_${barriers}`;
    server.start({ runId });
    server.start({ runId });
    await server.frame('ack');
}

function snapshot(server: ServerStandIn, connections: RunnerModelConnection[]) {
    server.send({ connections, type: 'runner-model-connections' });
}

function ack(
    server: ServerStandIn,
    rotation: RunnerUpFrame | undefined,
    result: 'failed' | 'stored' | 'superseded',
    credentialVersion: number
) {
    server.send({
        connectionId: 'mc_chatgpt',
        credentialVersion,
        result,
        rotationId: rotation?.type === 'runner-connection-credential' && rotation.rotationId,
        type: 'runner-connection-credential-ack',
    });
}

describe('model connection rotations', () => {
    test('a rotation the Server failed to store stays in use over an older snapshot and is resent after a reconnect', async () => {
        const { runner, server, store } = await rotatingRunner();
        snapshot(server, [plan(1, 1, 'Plus', 0)]);
        await handled(server);

        await store.modify('openai-codex', () => Promise.resolve(piCredential(2)));
        const rotation = await server.frame('runner-connection-credential');
        ack(server, rotation, 'failed', 1);
        snapshot(server, [plan(1, 1, 'Plus renamed', 0)]);
        await handled(server);

        expect(await store.read('openai-codex')).toEqual(piCredential(2));
        expect(runner.book.get('mc_chatgpt')).toEqual(plan(2, 1, 'Plus renamed'));
        expect(rotation).toEqual({
            baseVersion: 1,
            connectionId: 'mc_chatgpt',
            credential: oauth(2),
            previousRefresh: 'refresh-1',
            rotationId: expect.stringMatching(uuid),
            type: 'runner-connection-credential',
        });

        server.disconnect();
        expect(await server.frame('runner-connection-credential')).toEqual(rotation);
        ack(server, rotation, 'stored', 2);
        snapshot(server, [plan(2, 2)]);
        snapshot(server, [plan(9, 3)]);
        await handled(server);

        expect(await store.read('openai-codex')).toEqual(piCredential(9));
        expect(runner.book.get('mc_chatgpt')).toEqual(plan(9, 3));
    });

    test('two refreshes and a snapshot mid-refresh lose no rotation, and the second waits for the first ack', async () => {
        const { runner, server, store } = await rotatingRunner();
        snapshot(server, [plan(1, 1, 'Plus', 0)]);
        await handled(server);
        let release: () => void = () => undefined;
        const refreshing = new Promise<void>((resolve) => {
            release = resolve;
        });
        const secondSaw: string[] = [];

        const first = store.modify('openai-codex', async () => {
            await refreshing;
            return piCredential(2);
        });
        snapshot(server, [plan(1, 1, 'Plus renamed', 0)]);
        await handled(server);
        const second = store.modify('openai-codex', (current) => {
            secondSaw.push(current?.type === 'oauth' ? current.refresh : 'none');
            return Promise.resolve(piCredential(3));
        });
        release();
        await Promise.all([first, second]);
        const firstRotation = await server.frame('runner-connection-credential');
        snapshot(server, [plan(1, 1, 'Plus renamed', 0)]);
        await handled(server);

        expect(secondSaw).toEqual(['refresh-2']);
        expect(runner.book.get('mc_chatgpt')).toEqual(plan(3, 1, 'Plus renamed'));
        expect(firstRotation).toMatchObject({
            baseVersion: 1,
            credential: oauth(2),
            previousRefresh: 'refresh-1',
        });
        expect(
            server.received.filter((frame) => frame.type === 'runner-connection-credential')
        ).toEqual([]);

        ack(server, firstRotation, 'stored', 2);
        const secondRotation = await server.frame('runner-connection-credential');
        expect(secondRotation).toEqual({
            baseVersion: 2,
            connectionId: 'mc_chatgpt',
            credential: oauth(3),
            previousRefresh: 'refresh-2',
            rotationId: expect.stringMatching(uuid),
            type: 'runner-connection-credential',
        });
        expect(secondRotation).not.toMatchObject({
            rotationId:
                firstRotation?.type === 'runner-connection-credential' && firstRotation.rotationId,
        });

        ack(server, secondRotation, 'stored', 3);
        snapshot(server, [plan(3, 3)]);
        snapshot(server, [plan(4, 4)]);
        await handled(server);
        expect(runner.book.get('mc_chatgpt')).toEqual(plan(4, 4));
    });

    test('a superseded rotation gives way to the Server’s credential once its snapshot lands', async () => {
        const { runner, server, store } = await rotatingRunner();
        snapshot(server, [plan(1, 1, 'Plus', 0)]);
        await handled(server);

        await store.modify('openai-codex', () => Promise.resolve(piCredential(2)));
        const rotation = await server.frame('runner-connection-credential');
        ack(server, rotation, 'superseded', 2);
        snapshot(server, [plan(1, 1, 'Plus', 0)]);
        await handled(server);
        expect(await store.read('openai-codex')).toEqual(piCredential(2));

        snapshot(server, [plan(7, 2)]);
        await handled(server);
        expect(runner.book.get('mc_chatgpt')).toEqual(plan(7, 2));
        ack(server, rotation, 'failed', 2);
        server.disconnect();
        await server.frame('runner-inventory');
        await handled(server);
        expect(
            server.received.filter((frame) => frame.type === 'runner-connection-credential')
        ).toEqual([]);
    });
});
