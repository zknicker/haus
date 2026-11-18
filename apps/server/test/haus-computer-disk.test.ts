import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { computerBootstrapProtocolVersion, computerProtocolVersion } from '@haus/api';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

let harness: HausServerHarness;
let owner: HausClient;
let member: HausClient;
let serverId: string;
let socket: WebSocket;

const computerId = 'cmp_refresh000000000';
const credential = 'inventoryrefresh-computer-credential-00000000';

beforeAll(async () => {
    harness = await startHausServerHarness();
    owner = await signIn('cf_inventoryrefresh_owner');
    member = await signIn('cf_inventoryrefresh_member');
    serverId = (
        await owner.trpc.server.create.mutate({
            displayName: 'Inventory Refresh HQ',
            slug: 'inventoryrefresh-hq',
        })
    ).id;
    await member.trpc.server.create.mutate({
        displayName: 'Member Root',
        slug: 'inventoryrefresh-member-root',
    });
    const memberRows = (await harness.sql`
        select id from users where auth_subject = 'cf_inventoryrefresh_member'
    `) as { id: string }[];
    await harness.sql`
        insert into server_memberships (id, server_id, user_id, role)
        values ('mem_inventoryrefresh00000000', ${serverId}, ${memberRows[0]?.id}, 'member')
    `;
    const ownerRows = (await harness.sql`
        select id from users where auth_subject = 'cf_inventoryrefresh_owner'
    `) as { id: string }[];
    await harness.sql`
        insert into computers (id, server_id, attached_by_user_id, credential_hash)
        values (${computerId}, ${serverId}, ${ownerRows[0]?.id}, ${digest(credential)})
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
    expect(await message(socket)).toEqual({
        mode: 'ordinary',
        type: 'bootstrap-accepted',
    });
});

afterAll(async () => {
    socket?.close();
    owner?.close();
    member?.close();
    await harness?.close();
});

async function signIn(subject: string) {
    return createHausClient(harness, await harness.humans.mintSessionToken(subject));
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

test('actual disk reports reach authorized readers and clear on failure or disconnect', async () => {
    expect((await owner.trpc.computer.list.query({ serverId }))[0]?.diskStatus).toBeNull();
    const disk = { availableBytes: 4 * 1024 ** 3, totalBytes: 100 * 1024 ** 3 };
    socket.send(
        JSON.stringify({ type: 'disk-report', disk: { availableBytes: -1, totalBytes: 1 } })
    );
    socket.send(JSON.stringify({ type: 'disk-report', disk }));
    await expectEventually(
        async () => (await owner.trpc.computer.list.query({ serverId }))[0]?.diskStatus
    ).toEqual(disk);
    const computer = (await owner.trpc.computer.list.query({ serverId }))[0];
    expect(computer?.attachedByCurrentUser).toBe(true);
    await expect(member.trpc.computer.list.query({ serverId })).rejects.toThrow(
        'Only a Server Owner or Admin'
    );
    socket.send(JSON.stringify({ type: 'disk-report', disk: null }));
    await expectEventually(
        async () => (await owner.trpc.computer.list.query({ serverId }))[0]?.diskStatus
    ).toBeNull();
    socket.send(JSON.stringify({ type: 'disk-report', disk }));
    await expectEventually(
        async () => (await owner.trpc.computer.list.query({ serverId }))[0]?.diskStatus
    ).toEqual(disk);
    socket.close();
    await expectEventually(
        async () => (await owner.trpc.computer.list.query({ serverId }))[0]?.diskStatus
    ).toBeNull();
});

function expectEventually(read: () => Promise<unknown>) {
    return {
        async toEqual(expected: unknown) {
            await until(read, (value) => JSON.stringify(value) === JSON.stringify(expected));
        },
        async toBeNull() {
            await until(read, (value) => value === null);
        },
    };
}

async function until(read: () => Promise<unknown>, matches: (value: unknown) => boolean) {
    const deadline = Date.now() + 3000;
    let actual = await read();
    while (!matches(actual) && Date.now() < deadline) {
        await Bun.sleep(10);
        actual = await read();
    }
    expect(matches(actual)).toBe(true);
}
