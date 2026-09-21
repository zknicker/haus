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

const computerId = 'cmp_browser000000000';
const credential = 'browser-computer-credential-00000000';

beforeAll(async () => {
    harness = await startHausServerHarness();
    owner = await signIn('clerk_browser_owner');
    member = await signIn('clerk_browser_member');
    serverId = (
        await owner.trpc.server.create.mutate({
            displayName: 'Browser HQ',
            slug: 'browser-hq',
        })
    ).id;
    await member.trpc.server.create.mutate({
        displayName: 'Member Root',
        slug: 'browser-member-root',
    });
    const memberRows = (await harness.sql`
        select id from users where clerk_user_id = 'clerk_browser_member'
    `) as { id: string }[];
    await harness.sql`
        insert into server_memberships (id, server_id, user_id, role)
        values ('mem_browser00000000', ${serverId}, ${memberRows[0]?.id}, 'member')
    `;
    const ownerRows = (await harness.sql`
        select id from users where clerk_user_id = 'clerk_browser_owner'
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

test('only an Owner or Admin can relay Browser settings to this Server Computer', async () => {
    const computerReply = answerNextBrowserRequest(socket);
    await expect(owner.trpc.browser.get.query({ computerId, serverId })).resolves.toMatchObject({
        enabled: false,
        connection: null,
    });
    await computerReply;

    await expect(member.trpc.browser.get.query({ computerId, serverId })).rejects.toThrow(
        /Owner or Admin/i
    );
});

async function signIn(clerkUserId: string) {
    return createHausClient(harness, await harness.clerk.mintSessionToken(clerkUserId));
}

function answerNextBrowserRequest(connection: WebSocket) {
    return new Promise<void>((resolve) => {
        connection.addEventListener(
            'message',
            (event) => {
                const request = JSON.parse(String(event.data)) as {
                    requestId: string;
                    type: string;
                };
                expect(request.type).toBe('browser-request');
                connection.send(
                    JSON.stringify({
                        requestId: request.requestId,
                        result: {
                            kind: 'settings',
                            value: {
                                browsers: [],
                                configured: false,
                                enabled: false,
                                connection: null,
                                status: null,
                                updatedAt: null,
                            },
                        },
                        type: 'browser-result',
                    })
                );
                resolve();
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
