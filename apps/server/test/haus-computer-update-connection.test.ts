import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { computerBootstrapProtocolVersion, computerProtocolVersion } from '@haus/api';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

const computerId = 'cmp_offlineupdate000';
const credential = 'offline-update-computer-credential-00';
let harness: HausServerHarness;
let owner: HausClient;
let serverId: string;

beforeAll(async () => {
    harness = await startHausServerHarness();
    owner = createHausClient(
        harness,
        await harness.clerk.mintSessionToken('clerk_offlineupdate_owner')
    );
    serverId = (
        await owner.trpc.server.create.mutate({
            displayName: 'Offline Update',
            slug: 'offline-update',
        })
    ).id;
    const users = (await harness.sql`
        select id from users where clerk_user_id = 'clerk_offlineupdate_owner'
    `) as { id: string }[];
    const credentialHash = createHash('sha256').update(credential).digest('hex');
    await harness.sql`
        insert into computers (id, server_id, attached_by_user_id, credential_hash, product_version)
        values (${computerId}, ${serverId}, ${users[0]?.id}, ${credentialHash}, '4.2.0')
    `;
});

afterAll(async () => {
    owner?.close();
    await harness?.close();
});

test('an offline Computer cannot be checked or updated from its last reported version', async () => {
    await harness.sql`update computers set health = 'offline' where id = ${computerId}`;
    await expectUpdateRejected();
});

test('a Computer whose stored health outlived its attachment reports offline and cannot update', async () => {
    const socket = new WebSocket(computerSocketUrl());
    await opened(socket);
    const accepted = message(socket);
    socket.send(bootstrap());
    expect(await accepted).toEqual({ mode: 'ordinary', type: 'bootstrap-accepted' });
    expect(await listedHealth()).toBe('healthy');
    socket.close();
    await eventually(async () => {
        expect(await storedHealth()).toBe('offline');
    });

    // The stored column can lag or outlive its socket; the live registry is the truth.
    await harness.sql`update computers set health = 'healthy' where id = ${computerId}`;
    expect(await listedHealth()).toBe('offline');
    await expectUpdateRejected();
});

test('an update request the Computer never advanced is reported failed after two minutes', async () => {
    await harness.sql`
        update computers
        set update_phase = 'requested',
            update_detail = 'Download requested.',
            update_updated_at = now() - interval '3 minutes'
        where id = ${computerId}
    `;
    expect(await listedUpdate()).toMatchObject({
        updateFailedPhase: 'requested',
        updatePhase: 'failed',
    });

    await harness.sql`
        update computers set update_phase = 'checking', update_updated_at = now()
        where id = ${computerId}
    `;
    expect(await listedUpdate()).toMatchObject({ updatePhase: 'checking' });
    await harness.sql`
        update computers set update_phase = 'idle', update_updated_at = null
        where id = ${computerId}
    `;
});

test('update progress ages on the Server clock, not a Computer clock running behind', async () => {
    const skewedAt = new Date(Date.now() - 10 * 60_000).toISOString();
    const socket = new WebSocket(computerSocketUrl());
    await opened(socket);
    const accepted = message(socket);
    socket.send(
        bootstrap({ detail: null, phase: 'requested', targetVersion: '4.3.0', updatedAt: skewedAt })
    );
    expect(await accepted).toEqual({ mode: 'ordinary', type: 'bootstrap-accepted' });
    expect(await listedUpdate()).toMatchObject({
        updateFailedPhase: null,
        updatePhase: 'requested',
    });

    socket.send(
        JSON.stringify({
            type: 'update-progress',
            update: {
                activeAgentCount: null,
                downloadedBytes: null,
                failedPhase: null,
                detail: null,
                phase: 'checking',
                targetVersion: '4.3.0',
                totalBytes: null,
                updatedAt: skewedAt,
            },
        })
    );
    await eventually(async () => {
        expect(await listedUpdate()).toMatchObject({
            updateFailedPhase: null,
            updatePhase: 'checking',
        });
    });
    const { updateUpdatedAt } = await listedComputer();
    expect(Date.now() - new Date(updateUpdatedAt ?? 0).getTime()).toBeLessThan(60_000);
    socket.close();
});

async function expectUpdateRejected() {
    await expect(owner.trpc.computer.checkUpdate.mutate({ computerId, serverId })).rejects.toThrow(
        'Reconnect this Computer'
    );
    await expect(owner.trpc.computer.update.mutate({ computerId, serverId })).rejects.toThrow(
        'Reconnect this Computer'
    );
    const rows = (await harness.sql`
        select update_phase from computers where id = ${computerId}
    `) as { update_phase: string }[];
    expect(rows[0]?.update_phase).toBe('idle');
}

async function listedComputer() {
    const computers = await owner.trpc.computer.list.query({ serverId });
    const computer = computers.find((candidate) => candidate.id === computerId);
    if (!computer) {
        throw new Error('Computer missing from computer.list');
    }
    return computer;
}

async function listedHealth() {
    return (await listedComputer()).health;
}

async function listedUpdate() {
    const { updateFailedPhase, updatePhase } = await listedComputer();
    return { updateFailedPhase, updatePhase };
}

async function storedHealth() {
    const [row] = (await harness.sql`
        select health from computers where id = ${computerId}
    `) as { health: string }[];
    return row?.health;
}

function bootstrap(
    update = {
        detail: null,
        phase: 'idle',
        targetVersion: null,
        updatedAt: '2026-10-01T12:00:00.000Z',
    }
) {
    return JSON.stringify({
        architecture: 'arm64',
        bootstrapProtocolVersion: computerBootstrapProtocolVersion,
        credential,
        health: 'healthy',
        operatingSystem: 'darwin',
        productVersion: '4.2.0',
        protocolVersion: computerProtocolVersion,
        type: 'bootstrap',
        update,
    });
}

function computerSocketUrl() {
    const url = new URL('/computer/attachment', harness.url);
    url.protocol = 'ws:';
    return url;
}

function opened(socket: WebSocket) {
    return new Promise<void>((resolve, reject) => {
        socket.addEventListener('open', () => resolve(), { once: true });
        socket.addEventListener('error', () => reject(new Error('socket failed')), {
            once: true,
        });
    });
}

function message(socket: WebSocket) {
    return new Promise<unknown>((resolve) => {
        socket.addEventListener('message', (event) => resolve(JSON.parse(String(event.data))), {
            once: true,
        });
    });
}

async function eventually(assertion: () => Promise<void>) {
    for (let attempt = 0; attempt < 200; attempt += 1) {
        try {
            await assertion();
            return;
        } catch {
            await Bun.sleep(10);
        }
    }
    await assertion();
}
