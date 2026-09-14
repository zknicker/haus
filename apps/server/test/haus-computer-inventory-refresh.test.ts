import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import {
    computerBootstrapProtocolVersion,
    computerInventoryRefreshRequestSchema,
    computerProtocolVersion,
} from '@haus/api';
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
    owner = await signIn('clerk_inventoryrefresh_owner');
    member = await signIn('clerk_inventoryrefresh_member');
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
        select id from users where clerk_user_id = 'clerk_inventoryrefresh_member'
    `) as { id: string }[];
    await harness.sql`
        insert into server_memberships (id, server_id, user_id, role)
        values ('mem_inventoryrefresh00000000', ${serverId}, ${memberRows[0]?.id}, 'member')
    `;
    const ownerRows = (await harness.sql`
        select id from users where clerk_user_id = 'clerk_inventoryrefresh_owner'
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

async function signIn(clerkUserId: string) {
    return createHausClient(harness, await harness.clerk.mintSessionToken(clerkUserId));
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

test('refresh persists discovered models for every reader and preserves other inventory', async () => {
    await harness.sql`update computers set reported_inventory = ${{ name: 'My Computer', runtimes: [], importableSkills: [] }}::jsonb where id = ${computerId}`;
    const result = owner.trpc.computer.refreshInventory.mutate({ computerId, serverId });
    const request = computerInventoryRefreshRequestSchema.parse(await message(socket));
    const runtimes = [
        { id: 'grok-build', label: 'Grok Build', models: [{ id: 'grok-4.6', label: 'Grok 4.6' }] },
    ];
    socket.send(
        JSON.stringify({
            requestId: request.requestId,
            runtimes,
            status: 'refreshed',
            type: 'inventory-refresh-result',
        })
    );
    expect(await result).toEqual({ runtimeCount: 1 });
    const computers = await owner.trpc.computer.list.query({ serverId });
    expect(computers.find((computer) => computer.id === computerId)?.reportedInventory).toEqual({
        name: 'My Computer',
        runtimes,
        importableSkills: [],
    });
    const failedRefresh = owner.trpc.computer.refreshInventory.mutate({ computerId, serverId });
    const retry = computerInventoryRefreshRequestSchema.parse(await message(socket));
    socket.send(
        JSON.stringify({
            requestId: retry.requestId,
            status: 'failed',
            error: 'Could not scan installed runtimes on this Computer.',
            type: 'inventory-refresh-result',
        })
    );
    await expect(failedRefresh).rejects.toThrow('Could not scan');
    const retained = await owner.trpc.computer.list.query({ serverId });
    expect(retained.find((computer) => computer.id === computerId)?.reportedInventory).toEqual(
        computers.find((computer) => computer.id === computerId)?.reportedInventory
    );
    await expect(
        member.trpc.computer.refreshInventory.mutate({ computerId, serverId })
    ).rejects.toThrow(/Owner or Admin/i);
    await expect(
        owner.trpc.computer.refreshInventory.mutate({
            computerId: 'cmp_notattached00000',
            serverId,
        })
    ).rejects.toThrow('not attached');
});
