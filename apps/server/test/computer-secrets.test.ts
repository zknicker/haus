import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import {
    type ComputerSecretsStatus,
    computerBootstrapProtocolVersion,
    computerProtocolVersion,
} from '@haus/api';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

let harness: HausServerHarness;
let owner: HausClient;
let member: HausClient;
let serverId: string;
let socket: WebSocket;

const computerId = 'cmp_secrets000000000';
const credential = 'secrets-computer-credential-00000000';
const token = `ops_${'s'.repeat(48)}`;
const vault = { id: 'vaultid0000000000000000001', name: 'Agents' };
const items = [
    { field: 'credential' as const, id: 'item0000000000000000000001', title: 'Dummy API Key' },
];
const connected: ComputerSecretsStatus = {
    account: 'my.1password.com',
    connected: true,
    connectedAt: '2026-10-13T12:00:00.000Z',
    issue: null,
    items: [{ envName: 'DUMMY_API_KEY', title: 'Dummy API Key' }],
    itemsRefreshedAt: '2026-10-13T12:00:00.000Z',
    provider: '1password',
    serviceAccountName: 'Haus Computer Mac 2026-10-13',
    vault,
};
const connectInput = {
    account: 'my.1password.com',
    computerId,
    items,
    serviceAccountName: 'Haus Computer Mac 2026-10-13',
    token,
    vault,
};

beforeAll(async () => {
    harness = await startHausServerHarness();
    owner = await signIn('cf_secrets_owner');
    member = await signIn('cf_secrets_member');
    serverId = (
        await owner.trpc.server.create.mutate({ displayName: 'Secrets HQ', slug: 'secrets-hq' })
    ).id;
    await member.trpc.server.create.mutate({
        displayName: 'Member Root',
        slug: 'secrets-member-root',
    });
    const [memberRow] = (await harness.sql`
        select id from users where auth_subject = 'cf_secrets_member'
    `) as { id: string }[];
    await harness.sql`
        insert into server_memberships (id, server_id, user_id, role)
        values ('mem_secrets00000000', ${serverId}, ${memberRow?.id}, 'admin')
    `;
    const [ownerRow] = (await harness.sql`
        select id from users where auth_subject = 'cf_secrets_owner'
    `) as { id: string }[];
    await harness.sql`
        insert into computers (id, server_id, attached_by_user_id, credential_hash)
        values (${computerId}, ${serverId}, ${ownerRow?.id}, ${digest(credential)})
    `;
    socket = new WebSocket(computerSocketUrl());
    await opened(socket);
    socket.send(
        JSON.stringify({
            architecture: 'arm64',
            bootstrapProtocolVersion: computerBootstrapProtocolVersion,
            credential,
            health: 'healthy',
            operatingSystem: 'darwin',
            productVersion: '1.0.0',
            protocolVersion: computerProtocolVersion,
            type: 'bootstrap',
            update: {
                detail: null,
                phase: 'idle',
                targetVersion: null,
                updatedAt: '2026-07-28T12:00:00.000Z',
            },
        })
    );
    expect(await message(socket)).toEqual({ mode: 'ordinary', type: 'bootstrap-accepted' });
});

afterAll(async () => {
    socket?.close();
    owner?.close();
    member?.close();
    await harness?.close();
});

test('the Owner relays the token and item list to the Computer in one frame', async () => {
    const frame = answerNextSecretsRequest(socket, connected);
    await expect(
        owner.trpc.computerSecrets.connect.mutate({ ...connectInput, serverId })
    ).resolves.toEqual(connected);
    expect(await frame).toMatchObject({
        operation: { items, kind: 'connect', token, vault },
        type: 'computer-secrets-request',
    });
});

test('refresh relays a new item list without a token', async () => {
    const frame = answerNextSecretsRequest(socket, connected);
    await owner.trpc.computerSecrets.refreshItems.mutate({
        computerId,
        items,
        serverId,
        vaultId: vault.id,
    });
    const sent = await frame;
    expect(sent).toMatchObject({ operation: { kind: 'refresh-items', vaultId: vault.id } });
    expect(JSON.stringify(sent)).not.toContain('ops_');
});

test('an Admin cannot connect, refresh, or disconnect a Computer vault', async () => {
    let relayed = false;
    const listener = () => {
        relayed = true;
    };
    socket.addEventListener('message', listener);
    await expect(
        member.trpc.computerSecrets.connect.mutate({ ...connectInput, serverId })
    ).rejects.toThrow(/Only the Server Owner/);
    await expect(
        member.trpc.computerSecrets.disconnect.mutate({ computerId, serverId })
    ).rejects.toThrow(/Only the Server Owner/);
    socket.removeEventListener('message', listener);
    expect(relayed).toBe(false);
});

test('the token is never persisted', async () => {
    const rows = (await harness.sql`
        select reported_inventory::text as inventory from computers where id = ${computerId}
    `) as { inventory: string | null }[];
    expect(rows[0]?.inventory ?? '').not.toContain(token);
});

async function signIn(subject: string) {
    return createHausClient(harness, await harness.humans.mintSessionToken(subject));
}

function answerNextSecretsRequest(connection: WebSocket, result: ComputerSecretsStatus) {
    return new Promise<unknown>((resolve) => {
        connection.addEventListener(
            'message',
            (event) => {
                const request = JSON.parse(String(event.data)) as { requestId: string };
                connection.send(
                    JSON.stringify({
                        requestId: request.requestId,
                        result,
                        type: 'computer-secrets-result',
                    })
                );
                resolve(request);
            },
            { once: true }
        );
    });
}

function digest(value: string) {
    return createHash('sha256').update(value).digest('hex');
}

function computerSocketUrl() {
    const url = new URL('/computer/attachment', harness.url);
    url.protocol = 'ws:';
    return url;
}

function opened(connection: WebSocket) {
    return new Promise<void>((resolve, reject) => {
        connection.addEventListener('open', () => resolve(), { once: true });
        connection.addEventListener('error', () => reject(new Error('socket failed')), {
            once: true,
        });
    });
}

function message(connection: WebSocket) {
    return new Promise<unknown>((resolve) => {
        connection.addEventListener('message', (event) => resolve(JSON.parse(String(event.data))), {
            once: true,
        });
    });
}
